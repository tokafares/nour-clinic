import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DoctorDto, ServiceDto } from '../../shared/types.js';
import type { Db } from '../db/types.js';
import { doctors, services, workingHours, type ServiceRow } from '../db/schema.js';
import { notFound } from '../errors.js';

export function toServiceDto(row: ServiceRow): ServiceDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    durationMin: row.durationMin,
    priceEgp: row.priceEgp,
    active: row.active,
  };
}

export async function listServices(db: Db, opts: { includeInactive?: boolean } = {}): Promise<ServiceDto[]> {
  const rows = await db
    .select()
    .from(services)
    .where(opts.includeInactive ? undefined : eq(services.active, true))
    .orderBy(asc(services.sortOrder), asc(services.id));
  return rows.map(toServiceDto);
}

export async function getActiveService(db: Db, id: number): Promise<ServiceRow> {
  const [row] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, id), eq(services.active, true)));
  if (!row) throw notFound('That service is not available');
  return row;
}

export async function listDoctors(db: Db, ids?: number[]): Promise<DoctorDto[]> {
  const doctorRows = await db
    .select()
    .from(doctors)
    .where(ids ? and(eq(doctors.active, true), inArray(doctors.id, ids)) : eq(doctors.active, true))
    .orderBy(asc(doctors.id));
  if (doctorRows.length === 0) return [];
  const hourRows = await db
    .select()
    .from(workingHours)
    .where(
      inArray(
        workingHours.doctorId,
        doctorRows.map((d) => d.id),
      ),
    )
    .orderBy(asc(workingHours.weekday));
  return doctorRows.map((d) => ({
    id: d.id,
    name: d.name,
    title: d.title,
    specialty: d.specialty,
    bio: d.bio,
    photoUrl: d.photoUrl,
    workingHours: hourRows
      .filter((h) => h.doctorId === d.id)
      .map((h) => ({ weekday: h.weekday, startMin: h.startMin, endMin: h.endMin })),
  }));
}

/** Resolves "any" or a doctor id into the list of candidate doctors. */
export async function resolveDoctors(db: Db, choice: number | 'any'): Promise<DoctorDto[]> {
  const list = await listDoctors(db, choice === 'any' ? undefined : [choice]);
  if (choice !== 'any' && list.length === 0) throw notFound('That dentist is not available');
  return list;
}
