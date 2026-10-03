import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { admins, appointments, doctors, services, workingHours } from '../db/schema.js';
import { seed, SEED_DOCTORS, SEED_SERVICES } from '../db/seed.js';
import type { Db } from '../db/types.js';
import { createTestDb } from './helpers.js';

const NOW = new Date('2026-10-04T06:00:00Z');
const SECRET = 'test-cron-secret-0123456789abcdef';

let db: Db;
let close: () => Promise<void>;
let app: FastifyInstance;

const count = async (table: typeof appointments | typeof services | typeof doctors | typeof workingHours | typeof admins) =>
  (await db.select({ n: sql<number>`count(*)::int` }).from(table))[0]?.n ?? 0;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seed(db, { now: NOW, demoAppointments: false });
  app = await buildApp({ db, jwtSecret: 'x'.repeat(32), now: () => NOW, rateLimit: false, cronSecret: SECRET });
});

afterAll(async () => {
  await app.close();
  await close();
});

describe('GET /api/cron/reset-demo', () => {
  it('rejects requests without the secret or with a wrong one', async () => {
    const none = await app.inject({ method: 'GET', url: '/api/cron/reset-demo' });
    expect(none.statusCode).toBe(401);
    expect(none.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: expect.any(String) } });

    const wrong = await app.inject({
      method: 'GET',
      url: '/api/cron/reset-demo',
      headers: { authorization: `Bearer ${SECRET}x` },
    });
    expect(wrong.statusCode).toBe(401);

    const bare = await app.inject({ method: 'GET', url: '/api/cron/reset-demo', headers: { authorization: SECRET } });
    expect(bare.statusCode).toBe(401);
  });

  it('is disabled (fails closed) when no secret is configured', async () => {
    const unconfigured = await buildApp({ db, jwtSecret: 'x'.repeat(32), now: () => NOW, rateLimit: false });
    const res = await unconfigured.inject({ method: 'GET', url: '/api/cron/reset-demo', headers: { authorization: 'Bearer ' } });
    expect(res.statusCode).toBe(503);
    await unconfigured.close();
  });

  it('wipes everything and reseeds a fresh demo data set relative to now', async () => {
    // Leftovers that a reset must remove: a visitor booking and a renamed service.
    await db.insert(appointments).values({
      reference: 'NDC-ZZZZZZ',
      serviceId: 1,
      doctorId: 1,
      patientName: 'Leftover Visitor',
      patientPhone: '01000000000',
      patientEmail: 'left@example.com',
      startsAt: new Date('2026-10-05T08:00:00Z'),
      endsAt: new Date('2026-10-05T08:30:00Z'),
      priceEgp: 400,
    });
    await db.execute(sql`update ${services} set name = 'Renamed by a visitor' where id = 1`);

    const auth = { authorization: `Bearer ${SECRET}` };
    const res = await app.inject({ method: 'GET', url: '/api/cron/reset-demo', headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ ok: boolean; appointments: number }>();
    expect(body.ok).toBe(true);
    expect(body.appointments).toBeGreaterThanOrEqual(50);

    expect(await count(services)).toBe(SEED_SERVICES.length);
    expect(await count(doctors)).toBe(SEED_DOCTORS.length);
    expect(await count(workingHours)).toBe(SEED_DOCTORS.reduce((n, d) => n + d.hours.length, 0));
    expect(await count(admins)).toBe(1);
    expect(await count(appointments)).toBe(body.appointments);

    const leftovers = await db.select().from(appointments).where(sql`${appointments.patientName} = 'Leftover Visitor'`);
    expect(leftovers).toHaveLength(0);
    const [first] = await db.select().from(services).where(sql`${services.id} = 1`);
    expect(first?.name).toBe(SEED_SERVICES[0]?.name);

    // Data is spread around "now": some past, some today/upcoming, nothing booked in the future.
    const rows = await db.select().from(appointments);
    expect(rows.some((r) => r.startsAt < NOW)).toBe(true);
    expect(rows.some((r) => r.startsAt > NOW && r.status === 'confirmed')).toBe(true);
    expect(rows.every((r) => r.createdAt <= NOW)).toBe(true);
    expect(rows.filter((r) => r.startsAt > NOW).every((r) => r.status === 'confirmed' || r.status === 'cancelled')).toBe(true);

    // The demo admin can still sign in after the reset.
    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { email: 'admin@nourdental.demo', password: 'NourDemo2026' },
    });
    expect(login.statusCode).toBe(200);

    // Running it again is idempotent: same shape, ids restart.
    const again = await app.inject({ method: 'GET', url: '/api/cron/reset-demo', headers: auth });
    expect(again.statusCode).toBe(200);
    expect(again.json<{ appointments: number }>().appointments).toBe(body.appointments);
    expect(await count(services)).toBe(SEED_SERVICES.length);
    const ids = (await db.select({ id: doctors.id }).from(doctors)).map((d) => d.id).sort();
    expect(ids).toEqual([1, 2, 3]);
  });
});
