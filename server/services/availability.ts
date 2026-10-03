import { and, gt, inArray, lt, ne } from 'drizzle-orm';
import { BOOKING_WINDOW_DAYS } from '../../shared/constants.js';
import type { AvailabilityDayDto, DoctorDto, SlotDto } from '../../shared/types.js';
import { addDays, bookingWindow, weekdayOf, zonedTimeToUtc, type DateString } from '../../shared/time.js';
import type { Db } from '../db/types.js';
import { appointments } from '../db/schema.js';
import { computeSlots, type BusyInterval, type DoctorSchedule, type Slot } from '../lib/slots.js';
import { getActiveService, resolveDoctors } from './catalog.js';

export function toSchedules(list: DoctorDto[]): DoctorSchedule[] {
  return list.map((d) => ({ doctorId: d.id, shifts: d.workingHours }));
}

/** Non-cancelled appointments for the given doctors overlapping [from, to). */
export async function loadBusy(db: Db, doctorIds: number[], from: Date, to: Date): Promise<BusyInterval[]> {
  if (doctorIds.length === 0) return [];
  return db
    .select({ doctorId: appointments.doctorId, startsAt: appointments.startsAt, endsAt: appointments.endsAt })
    .from(appointments)
    .where(
      and(
        inArray(appointments.doctorId, doctorIds),
        ne(appointments.status, 'cancelled'),
        lt(appointments.startsAt, to),
        gt(appointments.endsAt, from),
      ),
    );
}

export function isWithinBookingWindow(date: DateString, now: Date): boolean {
  const window = bookingWindow(now, BOOKING_WINDOW_DAYS);
  return window.includes(date);
}

export async function slotsForDate(
  db: Db,
  params: { serviceId: number; doctorId: number | 'any'; date: DateString; now: Date },
): Promise<Slot[]> {
  if (!isWithinBookingWindow(params.date, params.now)) return [];
  const service = await getActiveService(db, params.serviceId);
  const doctorList = await resolveDoctors(db, params.doctorId);
  const dayStart = zonedTimeToUtc(params.date, 0);
  const dayEnd = zonedTimeToUtc(addDays(params.date, 1), 0);
  const busy = await loadBusy(
    db,
    doctorList.map((d) => d.id),
    dayStart,
    dayEnd,
  );
  return computeSlots({
    date: params.date,
    durationMin: service.durationMin,
    doctors: toSchedules(doctorList),
    busy,
    now: params.now,
  });
}

export function toSlotDto(slot: Slot): SlotDto {
  return {
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
    label: slot.label,
    doctorIds: slot.doctorIds,
  };
}

/** Availability summary for every day in the booking window (one DB round trip for bookings). */
export async function availabilityDays(
  db: Db,
  params: { serviceId: number; doctorId: number | 'any'; now: Date },
): Promise<AvailabilityDayDto[]> {
  const service = await getActiveService(db, params.serviceId);
  const doctorList = await resolveDoctors(db, params.doctorId);
  const schedules = toSchedules(doctorList);
  const dates = bookingWindow(params.now, BOOKING_WINDOW_DAYS);
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return [];
  const busy = await loadBusy(
    db,
    doctorList.map((d) => d.id),
    zonedTimeToUtc(first, 0),
    zonedTimeToUtc(addDays(last, 1), 0),
  );

  return dates.map((date) => {
    const weekday = weekdayOf(date);
    const open = schedules.some((s) => s.shifts.some((sh) => sh.weekday === weekday));
    const availableSlots = open
      ? computeSlots({ date, durationMin: service.durationMin, doctors: schedules, busy, now: params.now }).length
      : 0;
    return { date, weekday, open, availableSlots };
  });
}
