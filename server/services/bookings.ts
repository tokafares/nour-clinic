import { and, eq, gte, lt, ne, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { MIN_NOTICE_MINUTES } from '../../shared/constants.js';
import type { createBookingSchema } from '../../shared/schemas.js';
import type { AdminAppointmentDto, BookingDto } from '../../shared/types.js';
import { addDays, toZonedDateString, zonedTimeToUtc } from '../../shared/time.js';
import type { Db } from '../db/types.js';
import { appointments, doctors, services } from '../db/schema.js';
import {
  AppError,
  conflict,
  notFound,
  pgErrorCode,
  PG_EXCLUSION_VIOLATION,
  PG_UNIQUE_VIOLATION,
  unprocessable,
} from '../errors.js';
import { computeSlots } from '../lib/slots.js';
import { generateReference } from '../lib/reference.js';
import { isWithinBookingWindow, loadBusy, toSchedules } from './availability.js';
import { getActiveService, resolveDoctors } from './catalog.js';

export type CreateBookingData = z.output<typeof createBookingSchema>;

export const SLOT_TAKEN_MESSAGE = 'Sorry, that time was just booked by someone else. Please choose another time.';

const bookingSelection = {
  id: appointments.id,
  reference: appointments.reference,
  status: appointments.status,
  startsAt: appointments.startsAt,
  endsAt: appointments.endsAt,
  patientName: appointments.patientName,
  patientPhone: appointments.patientPhone,
  patientEmail: appointments.patientEmail,
  notes: appointments.notes,
  priceEgp: appointments.priceEgp,
  createdAt: appointments.createdAt,
  serviceId: services.id,
  serviceName: services.name,
  serviceDuration: services.durationMin,
  doctorId: doctors.id,
  doctorName: doctors.name,
  doctorTitle: doctors.title,
  doctorPhoto: doctors.photoUrl,
};

export function selectBookings(db: Db) {
  return db
    .select(bookingSelection)
    .from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(doctors, eq(doctors.id, appointments.doctorId));
}

export type BookingRow = Awaited<ReturnType<ReturnType<typeof selectBookings>['execute']>>[number];

export function toAdminAppointmentDto(row: BookingRow, now: Date): AdminAppointmentDto {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    patientName: row.patientName,
    patientPhone: row.patientPhone,
    patientEmail: row.patientEmail,
    notes: row.notes,
    priceEgp: row.priceEgp,
    createdAt: row.createdAt.toISOString(),
    service: { id: row.serviceId, name: row.serviceName, durationMin: row.serviceDuration },
    doctor: { id: row.doctorId, name: row.doctorName, title: row.doctorTitle, photoUrl: row.doctorPhoto },
    canCancel: row.status === 'confirmed' && row.startsAt.getTime() > now.getTime(),
  };
}

export function toBookingDto(row: BookingRow, now: Date): BookingDto {
  const { id: _id, createdAt: _createdAt, ...rest } = toAdminAppointmentDto(row, now);
  return rest;
}

async function findBooking(db: Db, where: SQL | undefined): Promise<BookingRow | undefined> {
  const [row] = await selectBookings(db).where(where).limit(1);
  return row;
}

/** Orders candidate doctors so "any available" spreads load: fewest bookings that day first. */
async function orderByWorkload(db: Db, doctorIds: number[], date: string): Promise<number[]> {
  if (doctorIds.length < 2) return doctorIds;
  const busy = await loadBusy(db, doctorIds, zonedTimeToUtc(date, 0), zonedTimeToUtc(addDays(date, 1), 0));
  const load = new Map(doctorIds.map((id) => [id, 0]));
  for (const b of busy) load.set(b.doctorId, (load.get(b.doctorId) ?? 0) + 1);
  return [...doctorIds].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0) || a - b);
}

/**
 * Books an appointment. The application-level checks give friendly errors;
 * the database exclusion constraint is the real guarantee against races —
 * a concurrent insert for an overlapping range fails with SQLSTATE 23P01,
 * which is translated into a 409.
 */
export async function createBooking(db: Db, input: CreateBookingData, now: Date): Promise<BookingDto> {
  const service = await getActiveService(db, input.serviceId);
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw unprocessable('INVALID_SLOT', 'Invalid appointment time');

  if (startsAt.getTime() <= now.getTime()) {
    throw unprocessable('SLOT_IN_PAST', 'That time has already passed. Please choose a future time.');
  }
  if (startsAt.getTime() < now.getTime() + MIN_NOTICE_MINUTES * 60_000) {
    throw unprocessable('NOTICE_TOO_SHORT', 'Same-day appointments need at least 2 hours notice.');
  }
  const date = toZonedDateString(startsAt);
  if (!isWithinBookingWindow(date, now)) {
    throw unprocessable('OUTSIDE_BOOKING_WINDOW', 'Appointments can be booked up to 21 days ahead.');
  }

  const doctorList = await resolveDoctors(db, input.doctorId);
  const base = { date, durationMin: service.durationMin, doctors: toSchedules(doctorList), now };
  const matches = (s: { startsAt: Date }): boolean => s.startsAt.getTime() === startsAt.getTime();

  // Is this start time on the schedule grid at all?
  const gridSlot = computeSlots({ ...base, busy: [] }).find(matches);
  if (!gridSlot) {
    throw unprocessable('INVALID_SLOT', "That time is outside the dentist's working hours.");
  }

  const busy = await loadBusy(db, gridSlot.doctorIds, zonedTimeToUtc(date, 0), zonedTimeToUtc(addDays(date, 1), 0));
  const freeSlot = computeSlots({ ...base, busy }).find(matches);
  if (!freeSlot) throw conflict('SLOT_TAKEN', SLOT_TAKEN_MESSAGE);

  const candidates = await orderByWorkload(db, freeSlot.doctorIds, date);
  const endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000);

  for (const doctorId of candidates) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const [inserted] = await db
          .insert(appointments)
          .values({
            reference: generateReference(),
            serviceId: service.id,
            doctorId,
            patientName: input.patientName,
            patientPhone: input.patientPhone,
            patientEmail: input.patientEmail,
            notes: input.notes,
            startsAt,
            endsAt,
            priceEgp: service.priceEgp,
          })
          .returning({ id: appointments.id });
        if (!inserted) throw new AppError(500, 'INSERT_FAILED', 'Could not save the booking');
        const row = await findBooking(db, eq(appointments.id, inserted.id));
        if (!row) throw new AppError(500, 'INSERT_FAILED', 'Could not save the booking');
        return toBookingDto(row, now);
      } catch (err) {
        const code = pgErrorCode(err);
        if (code === PG_EXCLUSION_VIOLATION) break; // this doctor was just taken, try the next one
        if (code === PG_UNIQUE_VIOLATION) continue; // reference collision, regenerate
        throw err;
      }
    }
  }
  throw conflict('SLOT_TAKEN', SLOT_TAKEN_MESSAGE);
}

const NOT_FOUND_MESSAGE = 'We could not find a booking with that reference and phone number.';

const byReferenceAndPhone = (reference: string, phone: string): SQL | undefined =>
  and(eq(appointments.reference, reference), eq(appointments.patientPhone, phone));

export async function lookupBooking(db: Db, reference: string, phone: string, now: Date): Promise<BookingDto> {
  const row = await findBooking(db, byReferenceAndPhone(reference, phone));
  if (!row) throw notFound(NOT_FOUND_MESSAGE);
  return toBookingDto(row, now);
}

export async function cancelBookingByPatient(db: Db, reference: string, phone: string, now: Date): Promise<BookingDto> {
  const row = await findBooking(db, byReferenceAndPhone(reference, phone));
  if (!row) throw notFound(NOT_FOUND_MESSAGE);
  if (row.status !== 'confirmed') {
    throw conflict('NOT_CANCELLABLE', `This booking is already ${row.status.replace('_', '-')} and cannot be cancelled.`);
  }
  if (row.startsAt.getTime() <= now.getTime()) {
    throw conflict('NOT_CANCELLABLE', 'This appointment has already started.');
  }
  await db
    .update(appointments)
    .set({ status: 'cancelled', updatedAt: now })
    .where(and(eq(appointments.id, row.id), eq(appointments.status, 'confirmed')));
  return toBookingDto({ ...row, status: 'cancelled' }, now);
}

/** Appointments starting within clinic-local dates [fromDate, toDateInclusive]. */
export function clinicDayRange(fromDate: string, toDateInclusive: string): SQL | undefined {
  return and(
    gte(appointments.startsAt, zonedTimeToUtc(fromDate, 0)),
    lt(appointments.startsAt, zonedTimeToUtc(addDays(toDateInclusive, 1), 0)),
  );
}

export const notCancelled = ne(appointments.status, 'cancelled');
export const countAll = sql<number>`count(*)::int`;
