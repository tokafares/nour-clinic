import { CalendarDays, Clock, Mail, Phone, Stethoscope, Wallet } from 'lucide-react';
import type { BookingDto } from '@shared/types';
import { formatDuration, formatEgp, formatLongDate, formatTime } from '../lib/format';
import { Avatar, StatusBadge } from './ui/Feedback';

/** Read-only summary of a booking, shared by the confirmation and manage pages. */
export function BookingDetails({ booking }: { booking: BookingDto }) {
  const rows = [
    { icon: CalendarDays, label: 'Date', value: formatLongDate(booking.startsAt) },
    {
      icon: Clock,
      label: 'Time',
      value: `${formatTime(booking.startsAt)} – ${formatTime(booking.endsAt)} (Cairo time)`,
    },
    {
      icon: Stethoscope,
      label: 'Treatment',
      value: `${booking.service.name} · ${formatDuration(booking.service.durationMin)}`,
    },
    { icon: Wallet, label: 'Price', value: `${formatEgp(booking.priceEgp)}, paid at the clinic` },
    { icon: Phone, label: 'Phone', value: booking.patientPhone },
    { icon: Mail, label: 'Email', value: booking.patientEmail },
  ];
  return (
    <div>
      <div className="flex items-center gap-3">
        <Avatar src={booking.doctor.photoUrl} alt="" className="size-12" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink">{booking.doctor.name}</p>
          <p className="truncate text-sm text-slate-500">{booking.doctor.title}</p>
        </div>
        <StatusBadge status={booking.status} />
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-3 rounded-xl bg-slate-50 p-3">
            <r.icon className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            <div className="min-w-0">
              <dt className="text-xs font-semibold text-slate-500">{r.label}</dt>
              <dd className="break-words text-sm font-semibold text-ink">{r.value}</dd>
            </div>
          </div>
        ))}
      </dl>
      {booking.notes && (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          <span className="block text-xs font-semibold text-slate-500">Notes</span>
          {booking.notes}
        </p>
      )}
    </div>
  );
}
