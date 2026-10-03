import { describe, expect, it } from 'vitest';
import { computeSlots, type DoctorSchedule } from '../lib/slots.js';
import { zonedTimeToUtc, toZonedDateString, bookingWindow } from '../../shared/time.js';

// Sunday 2026-10-11 in Cairo (UTC+3, before DST ends on the last Thursday of October).
const DATE = '2026-10-11';
const at = (label: string, date = DATE): Date => {
  const [h, m] = label.split(':').map(Number);
  return zonedTimeToUtc(date, (h ?? 0) * 60 + (m ?? 0));
};
const LONG_AGO = new Date('2026-10-01T00:00:00Z');

const karim: DoctorSchedule = {
  doctorId: 1,
  shifts: [{ weekday: 0, startMin: 9 * 60, endMin: 17 * 60 }],
};
const laila: DoctorSchedule = {
  doctorId: 2,
  shifts: [{ weekday: 0, startMin: 12 * 60, endMin: 20 * 60 }],
};

describe('timezone helpers', () => {
  it('converts Cairo wall-clock time to UTC in summer (UTC+3) and winter (UTC+2)', () => {
    expect(zonedTimeToUtc('2026-07-12', 9 * 60).toISOString()).toBe('2026-07-12T06:00:00.000Z');
    expect(zonedTimeToUtc('2026-01-11', 9 * 60).toISOString()).toBe('2026-01-11T07:00:00.000Z');
  });

  it('derives the clinic-local calendar date', () => {
    // 23:30 UTC on the 10th is already 02:30 on the 11th in Cairo.
    expect(toZonedDateString(new Date('2026-10-10T23:30:00Z'))).toBe('2026-10-11');
  });

  it('builds a 21-day booking window starting today', () => {
    const window = bookingWindow(new Date('2026-10-04T06:00:00Z'), 21);
    expect(window).toHaveLength(21);
    expect(window[0]).toBe('2026-10-04');
    expect(window[20]).toBe('2026-10-24');
  });
});

describe('computeSlots', () => {
  it('offers every 30 minutes and only start times where the whole service fits the shift', () => {
    const slots = computeSlots({ date: DATE, durationMin: 60, doctors: [karim], busy: [], now: LONG_AGO });
    expect(slots.map((s) => s.label)).toEqual([
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
      '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00',
    ]);
    const last = slots.at(-1);
    expect(last?.endsAt.getTime()).toBe(at('17:00').getTime());
  });

  it('returns nothing on a day the dentist does not work', () => {
    const monday = '2026-10-12';
    expect(computeSlots({ date: monday, durationMin: 30, doctors: [laila], busy: [], now: LONG_AGO })).toEqual([]);
  });

  it('returns nothing when the service is longer than the shift', () => {
    const short: DoctorSchedule = { doctorId: 9, shifts: [{ weekday: 0, startMin: 600, endMin: 660 }] };
    expect(computeSlots({ date: DATE, durationMin: 90, doctors: [short], busy: [], now: LONG_AGO })).toEqual([]);
  });

  it('removes start times that overlap an existing booking but allows back-to-back appointments', () => {
    const busy = [{ doctorId: 1, startsAt: at('10:00'), endsAt: at('10:45') }];
    const labels = computeSlots({ date: DATE, durationMin: 30, doctors: [karim], busy, now: LONG_AGO }).map((s) => s.label);
    expect(labels).toContain('09:30'); // ends exactly when the booking starts
    expect(labels).not.toContain('10:00');
    expect(labels).not.toContain('10:30'); // overlaps 10:30–10:45
    expect(labels).toContain('11:00');
  });

  it('ignores other doctors’ bookings', () => {
    const busy = [{ doctorId: 2, startsAt: at('10:00'), endsAt: at('11:00') }];
    const labels = computeSlots({ date: DATE, durationMin: 30, doctors: [karim], busy, now: LONG_AGO }).map((s) => s.label);
    expect(labels).toContain('10:00');
  });

  it('requires 2 hours notice for same-day bookings', () => {
    const now = at('10:15');
    const labels = computeSlots({ date: DATE, durationMin: 30, doctors: [karim], busy: [], now }).map((s) => s.label);
    expect(labels[0]).toBe('12:30');
    expect(labels).not.toContain('12:00');
  });

  it('offers nothing for a date in the past', () => {
    const now = new Date('2026-10-20T08:00:00Z');
    expect(computeSlots({ date: DATE, durationMin: 30, doctors: [karim], busy: [], now })).toEqual([]);
  });

  it('merges doctors for "any available" and lists who is free at each time', () => {
    const busy = [{ doctorId: 1, startsAt: at('13:00'), endsAt: at('14:00') }];
    const slots = computeSlots({ date: DATE, durationMin: 30, doctors: [karim, laila], busy, now: LONG_AGO });
    const byLabel = new Map(slots.map((s) => [s.label, s.doctorIds]));
    expect(byLabel.get('09:00')).toEqual([1]);
    expect(byLabel.get('12:00')).toEqual([1, 2]);
    expect(byLabel.get('13:00')).toEqual([2]);
    expect(byLabel.get('19:30')).toEqual([2]);
    // Sorted chronologically and unique by start time.
    const times = slots.map((s) => s.startsAt.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(new Set(times).size).toBe(times.length);
  });

  it('respects a custom step size', () => {
    const slots = computeSlots({ date: DATE, durationMin: 60, doctors: [karim], busy: [], now: LONG_AGO, stepMin: 60 });
    expect(slots.map((s) => s.label)).toEqual(['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
  });
});
