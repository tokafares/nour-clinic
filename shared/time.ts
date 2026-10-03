import { CLINIC_TIMEZONE } from './constants.js';

/** A calendar date in the clinic's timezone, formatted YYYY-MM-DD. */
export type DateString = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(date: DateString): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date string: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function isValidDateString(date: string): boolean {
  const m = DATE_RE.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(instant: Date, tz: string = CLINIC_TIMEZONE): ZonedParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year ?? 0,
    month: out.month ?? 0,
    day: out.day ?? 0,
    hour: out.hour ?? 0,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
  };
}

/** Offset of `tz` from UTC at `instant`, in minutes (Cairo is +120 or +180). */
export function tzOffsetMinutes(instant: Date, tz: string = CLINIC_TIMEZONE): number {
  const p = zonedParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** Converts a wall-clock time (date + minutes after midnight) in `tz` to a UTC instant. */
export function zonedTimeToUtc(date: DateString, minutesOfDay: number, tz: string = CLINIC_TIMEZONE): Date {
  const [y, m, d] = parseDate(date);
  const naive = Date.UTC(y, m - 1, d, 0, minutesOfDay);
  // Two passes handle instants close to a DST transition.
  const first = naive - tzOffsetMinutes(new Date(naive), tz) * 60_000;
  const second = naive - tzOffsetMinutes(new Date(first), tz) * 60_000;
  return new Date(second);
}

/** The calendar date of `instant` in `tz`. */
export function toZonedDateString(instant: Date, tz: string = CLINIC_TIMEZONE): DateString {
  const p = zonedParts(instant, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Minutes after midnight of `instant` in `tz`. */
export function zonedMinutesOfDay(instant: Date, tz: string = CLINIC_TIMEZONE): number {
  const p = zonedParts(instant, tz);
  return p.hour * 60 + p.minute;
}

export function addDays(date: DateString, days: number): DateString {
  const [y, m, d] = parseDate(date);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: DateString): number {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function minutesToLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function labelToMinutes(label: string): number {
  const [h, m] = label.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Inclusive list of bookable dates starting today (clinic time). */
export function bookingWindow(now: Date, days: number, tz: string = CLINIC_TIMEZONE): DateString[] {
  const today = toZonedDateString(now, tz);
  return Array.from({ length: days }, (_, i) => addDays(today, i));
}
