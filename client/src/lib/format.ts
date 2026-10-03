import { CLINIC_TIMEZONE, WEEKDAY_LABELS } from '@shared/constants';
import { minutesToLabel } from '@shared/time';

const egp = new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 });
export const formatEgp = (amount: number): string => `${egp.format(amount)} EGP`;

export const formatDuration = (min: number): string => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

const make = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: CLINIC_TIMEZONE, ...opts });
const timeFmt = make({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const longDateFmt = make({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDateFmt = make({ weekday: 'short', day: 'numeric', month: 'short' });

export const formatTime = (iso: string): string => timeFmt.format(new Date(iso));
export const formatLongDate = (iso: string): string => longDateFmt.format(new Date(iso));
export const formatShortDate = (iso: string): string => shortDateFmt.format(new Date(iso));

/** Formats a clinic-local YYYY-MM-DD without timezone drift. */
export function formatDateString(date: string, style: 'long' | 'short' = 'long'): string {
  const [y, m, d] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, d ?? 1, 12));
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    ...(style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long' }
      : { weekday: 'short', day: 'numeric', month: 'short' }),
  }).format(utc);
}

export const dayParts = (date: string): { weekday: string; day: number; month: string } => {
  const [y, m, d] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, d ?? 1, 12));
  return {
    weekday: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' }).format(utc),
    day: d ?? 1,
    month: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short' }).format(utc),
  };
};

export const formatShift = (startMin: number, endMin: number): string =>
  `${minutesToLabel(startMin)} – ${minutesToLabel(endMin)}`;

export const weekdayShort = (weekday: number): string => (WEEKDAY_LABELS[weekday] ?? '').slice(0, 3);

export function workingDaysSummary(weekdays: number[]): string {
  // Display in the Egyptian week order, Saturday first.
  const order = [6, 0, 1, 2, 3, 4, 5];
  return order.filter((d) => weekdays.includes(d)).map(weekdayShort).join(', ');
}

export const initials = (name: string): string =>
  name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
