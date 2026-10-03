import { and, asc, eq, gte, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import type { AppointmentStatus } from '../../shared/constants.js';
import type { appointmentFiltersSchema, serviceInputSchema, workingHoursSchema } from '../../shared/schemas.js';
import type { AdminAppointmentDto, DoctorDto, PaginatedDto, ServiceDto, StatsDto } from '../../shared/types.js';
import { addDays, toZonedDateString, weekdayOf } from '../../shared/time.js';
import type { Db } from '../db/types.js';
import { appointments, doctors, services, workingHours } from '../db/schema.js';
import { conflict, notFound, pgErrorCode, PG_EXCLUSION_VIOLATION, PG_FOREIGN_KEY_VIOLATION, PG_RESTRICT_VIOLATION, PG_UNIQUE_VIOLATION } from '../errors.js';
import { clinicDayRange, countAll, notCancelled, selectBookings, toAdminAppointmentDto } from './bookings.js';
import { listDoctors, toServiceDto } from './catalog.js';

type Filters = z.output<typeof appointmentFiltersSchema>;

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function filtersToWhere(f: Filters): SQL | undefined {
  const parts: (SQL | undefined)[] = [];
  if (f.date) parts.push(clinicDayRange(f.date, f.date));
  else if (f.from || f.to) parts.push(clinicDayRange(f.from ?? '2000-01-01', f.to ?? '2999-12-31'));
  if (f.doctorId) parts.push(eq(appointments.doctorId, f.doctorId));
  if (f.status) parts.push(eq(appointments.status, f.status));
  if (f.q) {
    const term = `%${escapeLike(f.q)}%`;
    parts.push(
      or(
        ilike(appointments.patientName, term),
        ilike(appointments.patientEmail, term),
        ilike(appointments.patientPhone, `%${escapeLike(f.q.replace(/[\s\-().]/g, ''))}%`),
        ilike(appointments.reference, term),
      ),
    );
  }
  return and(...parts);
}

export async function listAppointments(db: Db, f: Filters, now: Date): Promise<PaginatedDto<AdminAppointmentDto>> {
  const where = filtersToWhere(f);
  const [rows, totals] = await Promise.all([
    selectBookings(db)
      .where(where)
      .orderBy(asc(appointments.startsAt))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize),
    db.select({ total: countAll }).from(appointments).where(where),
  ]);
  return {
    items: rows.map((r) => toAdminAppointmentDto(r, now)),
    total: totals[0]?.total ?? 0,
    page: f.page,
    pageSize: f.pageSize,
  };
}

export async function updateAppointmentStatus(
  db: Db,
  id: string,
  status: AppointmentStatus,
  now: Date,
): Promise<AdminAppointmentDto> {
  try {
    const [updated] = await db
      .update(appointments)
      .set({ status, updatedAt: now })
      .where(eq(appointments.id, id))
      .returning({ id: appointments.id });
    if (!updated) throw notFound('Appointment not found');
  } catch (err) {
    // Re-activating a cancelled appointment whose slot has since been re-booked.
    if (pgErrorCode(err) === PG_EXCLUSION_VIOLATION) {
      throw conflict('SLOT_TAKEN', 'That time slot has been booked by another patient since this was cancelled.');
    }
    throw err;
  }
  const [row] = await selectBookings(db).where(eq(appointments.id, id));
  if (!row) throw notFound('Appointment not found');
  return toAdminAppointmentDto(row, now);
}

/** Egyptian weeks run Saturday to Friday. */
export function weekBounds(today: string): { start: string; end: string } {
  const offset = (weekdayOf(today) + 1) % 7; // Saturday → 0
  const start = addDays(today, -offset);
  return { start, end: addDays(start, 6) };
}

export const CANCELLATION_WINDOW_DAYS = 30;

export async function getStats(db: Db, now: Date): Promise<StatsDto> {
  const today = toZonedDateString(now);
  const week = weekBounds(today);
  const windowStart = new Date(now.getTime() - CANCELLATION_WINDOW_DAYS * 86_400_000);

  const [[todayRow], [weekRow], [upcomingRow], [cancelRow]] = await Promise.all([
    db
      .select({
        total: countAll,
        completed: sql<number>`count(*) filter (where ${appointments.status} = 'completed')::int`,
      })
      .from(appointments)
      .where(and(clinicDayRange(today, today), notCancelled)),
    db.select({ total: countAll }).from(appointments).where(and(clinicDayRange(week.start, week.end), notCancelled)),
    db
      .select({ total: countAll })
      .from(appointments)
      .where(and(eq(appointments.status, 'confirmed'), gte(appointments.startsAt, now))),
    db
      .select({
        total: countAll,
        cancelled: sql<number>`count(*) filter (where ${appointments.status} = 'cancelled')::int`,
      })
      .from(appointments)
      .where(gte(appointments.createdAt, windowStart)),
  ]);

  const created = cancelRow?.total ?? 0;
  return {
    today: todayRow?.total ?? 0,
    todayCompleted: todayRow?.completed ?? 0,
    thisWeek: weekRow?.total ?? 0,
    upcoming: upcomingRow?.total ?? 0,
    cancellationRate: created === 0 ? 0 : Math.round(((cancelRow?.cancelled ?? 0) / created) * 1000) / 10,
    cancellationWindowDays: CANCELLATION_WINDOW_DAYS,
  };
}

// ---------- Services CRUD ----------

type ServiceData = z.output<typeof serviceInputSchema>;

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'service';

export async function createService(db: Db, data: ServiceData): Promise<ServiceDto> {
  const base = slugify(data.name);
  const [{ maxOrder } = { maxOrder: 0 }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${services.sortOrder}), 0)::int` })
    .from(services);
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    try {
      const [row] = await db
        .insert(services)
        .values({ ...data, slug, sortOrder: maxOrder + 1 })
        .returning();
      if (row) return toServiceDto(row);
    } catch (err) {
      if (pgErrorCode(err) !== PG_UNIQUE_VIOLATION) throw err;
    }
  }
  throw conflict('DUPLICATE_SERVICE', 'A service with a similar name already exists.');
}

export async function updateService(db: Db, id: number, data: ServiceData): Promise<ServiceDto> {
  const [row] = await db.update(services).set(data).where(eq(services.id, id)).returning();
  if (!row) throw notFound('Service not found');
  return toServiceDto(row);
}

export async function deleteService(db: Db, id: number): Promise<void> {
  try {
    const deleted = await db.delete(services).where(eq(services.id, id)).returning({ id: services.id });
    if (deleted.length === 0) throw notFound('Service not found');
  } catch (err) {
    const code = pgErrorCode(err);
    if (code === PG_FOREIGN_KEY_VIOLATION || code === PG_RESTRICT_VIOLATION) {
      throw conflict(
        'SERVICE_IN_USE',
        'This service has appointments on record. Hide it from booking instead of deleting it.',
      );
    }
    throw err;
  }
}

// ---------- Doctors' working hours ----------

export async function listAllDoctors(db: Db): Promise<DoctorDto[]> {
  return listDoctors(db);
}

export async function replaceWorkingHours(
  db: Db,
  doctorId: number,
  rows: z.output<typeof workingHoursSchema>,
): Promise<DoctorDto> {
  const [doctor] = await db.select({ id: doctors.id }).from(doctors).where(eq(doctors.id, doctorId));
  if (!doctor) throw notFound('Dentist not found');
  await db.transaction(async (tx) => {
    await tx.delete(workingHours).where(eq(workingHours.doctorId, doctorId));
    if (rows.length > 0) await tx.insert(workingHours).values(rows.map((r) => ({ ...r, doctorId })));
  });
  const [updated] = await listDoctors(db, [doctorId]);
  if (!updated) throw notFound('Dentist not found');
  return updated;
}

