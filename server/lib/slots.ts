import { CLINIC_TIMEZONE, MIN_NOTICE_MINUTES, SLOT_STEP_MINUTES } from '../../shared/constants.js';
import { minutesToLabel, weekdayOf, zonedTimeToUtc, type DateString } from '../../shared/time.js';

export interface Shift {
  weekday: number;
  startMin: number;
  endMin: number;
}

export interface DoctorSchedule {
  doctorId: number;
  shifts: Shift[];
}

export interface BusyInterval {
  doctorId: number;
  startsAt: Date;
  endsAt: Date;
}

export interface Slot {
  startsAt: Date;
  endsAt: Date;
  /** Clinic-local start time, e.g. "09:30". */
  label: string;
  /** Doctors free for the whole duration, in the order they were provided. */
  doctorIds: number[];
}

export interface ComputeSlotsInput {
  date: DateString;
  durationMin: number;
  doctors: DoctorSchedule[];
  busy: BusyInterval[];
  now: Date;
  stepMin?: number;
  minNoticeMin?: number;
  timeZone?: string;
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean => aStart < bEnd && bStart < aEnd;

/**
 * Computes bookable start times for one clinic-local date.
 *
 * A start time is offered when, for at least one doctor:
 *  - the whole appointment fits inside that doctor's shift for the weekday,
 *  - it starts at least `minNoticeMin` after `now` (covers "no past bookings"
 *    and "same-day needs 2 hours notice"),
 *  - it does not overlap any of that doctor's existing (non-cancelled) bookings.
 */
export function computeSlots(input: ComputeSlotsInput): Slot[] {
  const {
    date,
    durationMin,
    doctors,
    busy,
    now,
    stepMin = SLOT_STEP_MINUTES,
    minNoticeMin = MIN_NOTICE_MINUTES,
    timeZone = CLINIC_TIMEZONE,
  } = input;
  if (durationMin <= 0 || stepMin <= 0) return [];

  const weekday = weekdayOf(date);
  const earliest = now.getTime() + minNoticeMin * 60_000;
  const byStart = new Map<number, Slot>();

  for (const doctor of doctors) {
    const doctorBusy = busy.filter((b) => b.doctorId === doctor.doctorId);
    for (const shift of doctor.shifts) {
      if (shift.weekday !== weekday) continue;
      for (let t = shift.startMin; t + durationMin <= shift.endMin; t += stepMin) {
        const start = zonedTimeToUtc(date, t, timeZone).getTime();
        const end = start + durationMin * 60_000;
        if (start < earliest) continue;
        if (doctorBusy.some((b) => overlaps(start, end, b.startsAt.getTime(), b.endsAt.getTime()))) continue;

        const existing = byStart.get(start);
        if (existing) {
          if (!existing.doctorIds.includes(doctor.doctorId)) existing.doctorIds.push(doctor.doctorId);
        } else {
          byStart.set(start, {
            startsAt: new Date(start),
            endsAt: new Date(end),
            label: minutesToLabel(t),
            doctorIds: [doctor.doctorId],
          });
        }
      }
    }
  }

  return [...byStart.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
