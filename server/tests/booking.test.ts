import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { appointments, doctors, services } from '../db/schema.js';
import { seed } from '../db/seed.js';
import type { Db } from '../db/types.js';
import { AppError, pgErrorCode, PG_EXCLUSION_VIOLATION } from '../errors.js';
import { cancelBookingByPatient, createBooking, type CreateBookingData } from '../services/bookings.js';
import { zonedTimeToUtc } from '../../shared/time.js';
import type { ApiErrorBody, BookingDto } from '../../shared/types.js';
import { createTestDb } from './helpers.js';

// "Now" is Sunday 2026-10-04 09:00 in Cairo. Bookings go on Sunday 2026-10-11, when
// Dr. Karim (09:00–17:00) and Dr. Laila (12:00–20:00) both work.
const NOW = new Date('2026-10-04T06:00:00Z');
const DATE = '2026-10-11';
const at = (h: number, m = 0): string => zonedTimeToUtc(DATE, h * 60 + m).toISOString();

let db: Db;
let close: () => Promise<void>;
let karimId: number;
let lailaId: number;
let checkupId: number; // 30 min
let fillingId: number; // 60 min

const patient = {
  patientName: 'Test Patient',
  patientPhone: '01001234567',
  patientEmail: 'test@example.com',
  notes: '',
};

const booking = (overrides: Partial<CreateBookingData>): CreateBookingData => ({
  ...patient,
  serviceId: checkupId,
  doctorId: karimId,
  startsAt: at(10),
  ...overrides,
});

async function expectAppError(promise: Promise<unknown>, status: number, code: string): Promise<void> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(status);
  expect((err as AppError).code).toBe(code);
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seed(db, { now: NOW, demoAppointments: false });
  const docs = await db.select().from(doctors);
  const svcs = await db.select().from(services);
  karimId = docs.find((d) => d.name.includes('Karim'))!.id;
  lailaId = docs.find((d) => d.name.includes('Laila'))!.id;
  checkupId = svcs.find((s) => s.slug === 'checkup')!.id;
  fillingId = svcs.find((s) => s.slug === 'filling')!.id;
});

afterAll(async () => {
  await close();
});

beforeEach(async () => {
  await db.execute(sql`delete from ${appointments}`);
});

describe('double-booking protection', () => {
  it('books a free slot and returns a reference', async () => {
    const result = await createBooking(db, booking({}), NOW);
    expect(result.reference).toMatch(/^NDC-[A-Z0-9]{6}$/);
    expect(result.status).toBe('confirmed');
    expect(result.doctor.id).toBe(karimId);
    expect(result.endsAt).toBe(at(10, 30));
  });

  it('rejects a second booking for the same doctor and time with 409 SLOT_TAKEN', async () => {
    await createBooking(db, booking({}), NOW);
    await expectAppError(createBooking(db, booking({ patientName: 'Someone Else' }), NOW), 409, 'SLOT_TAKEN');
  });

  it('rejects partially overlapping bookings', async () => {
    await createBooking(db, booking({ serviceId: fillingId, startsAt: at(10) }), NOW); // 10:00–11:00
    await expectAppError(createBooking(db, booking({ startsAt: at(10, 30) }), NOW), 409, 'SLOT_TAKEN');
    // Back-to-back is fine.
    await expect(createBooking(db, booking({ startsAt: at(11) }), NOW)).resolves.toMatchObject({ status: 'confirmed' });
  });

  it('lets only one of many simultaneous requests win the same slot', async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => createBooking(db, booking({ patientName: `Racer ${i}` }), NOW)),
    );
    const won = attempts.filter((a) => a.status === 'fulfilled');
    const lost = attempts.filter((a): a is PromiseRejectedResult => a.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(5);
    for (const l of lost) expect((l.reason as AppError).statusCode).toBe(409);
    const rows = await db.select().from(appointments).where(eq(appointments.doctorId, karimId));
    expect(rows).toHaveLength(1);
  });

  it('is enforced by the database itself (exclusion constraint), not just application checks', async () => {
    const base = {
      reference: 'NDC-AAAAAA',
      serviceId: checkupId,
      doctorId: karimId,
      ...patient,
      startsAt: new Date(at(14)),
      endsAt: new Date(at(14, 30)),
      priceEgp: 400,
    };
    await db.insert(appointments).values(base);
    const err = await db
      .insert(appointments)
      .values({ ...base, reference: 'NDC-BBBBBB', startsAt: new Date(at(14, 15)), endsAt: new Date(at(14, 45)) })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(pgErrorCode(err)).toBe(PG_EXCLUSION_VIOLATION);
    // A different doctor at the same time is allowed.
    await db.insert(appointments).values({ ...base, reference: 'NDC-CCCCCC', doctorId: lailaId });
  });

  it('frees the slot again once a booking is cancelled', async () => {
    const first = await createBooking(db, booking({}), NOW);
    await cancelBookingByPatient(db, first.reference, patient.patientPhone, NOW);
    await expect(createBooking(db, booking({ patientName: 'Next Patient' }), NOW)).resolves.toMatchObject({
      status: 'confirmed',
    });
  });

  it('assigns another free dentist for "any available" and 409s when everyone is booked', async () => {
    const a = await createBooking(db, booking({ doctorId: 'any', startsAt: at(13) }), NOW);
    const b = await createBooking(db, booking({ doctorId: 'any', startsAt: at(13) }), NOW);
    expect(new Set([a.doctor.id, b.doctor.id])).toEqual(new Set([karimId, lailaId]));
    await expectAppError(createBooking(db, booking({ doctorId: 'any', startsAt: at(13) }), NOW), 409, 'SLOT_TAKEN');
  });
});

describe('booking rules', () => {
  it('rejects same-day bookings with less than 2 hours notice', async () => {
    const now = new Date(at(9, 15)); // same day, 09:15 local
    await expectAppError(createBooking(db, booking({ startsAt: at(11) }), now), 422, 'NOTICE_TOO_SHORT');
    await expect(createBooking(db, booking({ startsAt: at(11, 30) }), now)).resolves.toBeTruthy();
  });

  it('rejects times in the past', async () => {
    const later = new Date('2026-10-12T06:00:00Z');
    await expectAppError(createBooking(db, booking({}), later), 422, 'SLOT_IN_PAST');
  });

  it('rejects times outside working hours or off the slot grid', async () => {
    await expectAppError(createBooking(db, booking({ startsAt: at(8) }), NOW), 422, 'INVALID_SLOT');
    await expectAppError(createBooking(db, booking({ startsAt: at(10, 10) }), NOW), 422, 'INVALID_SLOT');
  });

  it('rejects dates beyond the 21-day window', async () => {
    const far = zonedTimeToUtc('2026-11-01', 10 * 60).toISOString();
    await expectAppError(createBooking(db, booking({ startsAt: far }), NOW), 422, 'OUTSIDE_BOOKING_WINDOW');
  });
});

describe('HTTP API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ db, jwtSecret: 'x'.repeat(32), now: () => NOW, rateLimit: false });
  });
  afterAll(async () => {
    await app.close();
  });

  const payload = { ...patient, serviceId: 0, doctorId: 0, startsAt: '' };

  it('returns 201 then a 409 with the standard error body for a double booking', async () => {
    const body = { ...payload, serviceId: checkupId, doctorId: karimId, startsAt: at(15) };
    const first = await app.inject({ method: 'POST', url: '/api/bookings', payload: body });
    expect(first.statusCode).toBe(201);
    expect(first.json<{ booking: BookingDto }>().booking.reference).toMatch(/^NDC-/);

    const second = await app.inject({ method: 'POST', url: '/api/bookings', payload: body });
    expect(second.statusCode).toBe(409);
    expect(second.json<ApiErrorBody>()).toEqual({
      error: { code: 'SLOT_TAKEN', message: expect.any(String) },
    });
  });

  it('returns 400 with field details for invalid input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/bookings',
      payload: { ...payload, serviceId: checkupId, doctorId: karimId, startsAt: at(15), patientEmail: 'nope' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<ApiErrorBody>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.some((d) => d.path === 'patientEmail')).toBe(true);
  });

  it('hides booked times from the slots endpoint', async () => {
    const body = { ...payload, serviceId: checkupId, doctorId: karimId, startsAt: at(16) };
    await app.inject({ method: 'POST', url: '/api/bookings', payload: body });
    const res = await app.inject({
      method: 'GET',
      url: `/api/availability/slots?serviceId=${checkupId}&doctorId=${karimId}&date=${DATE}`,
    });
    const labels = res.json<{ slots: { label: string }[] }>().slots.map((s) => s.label);
    expect(labels).toContain('15:30');
    expect(labels).not.toContain('16:00');
  });

  it('protects admin routes and logs in with the demo account', async () => {
    const denied = await app.inject({ method: 'GET', url: '/api/admin/stats' });
    expect(denied.statusCode).toBe(401);

    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'admin@nourdental.demo', password: 'NourDemo2026' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies.find((c) => c.name === 'nour_admin');
    expect(cookie?.httpOnly).toBe(true);

    const stats = await app.inject({ method: 'GET', url: '/api/admin/stats', cookies: { nour_admin: cookie!.value } });
    expect(stats.statusCode).toBe(200);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'admin@nourdental.demo', password: 'wrong' },
    });
    expect(bad.statusCode).toBe(401);
  });

  it('refuses to delete a service that has appointments with a 409', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'admin@nourdental.demo', password: 'NourDemo2026' },
    });
    const cookies = { nour_admin: login.cookies.find((c) => c.name === 'nour_admin')!.value };
    await createBooking(db, booking({ startsAt: at(9) }), NOW);
    const res = await app.inject({ method: 'DELETE', url: `/api/admin/services/${checkupId}`, cookies });
    expect(res.statusCode).toBe(409);
    expect(res.json<ApiErrorBody>().error.code).toBe('SERVICE_IN_USE');
  });
});
