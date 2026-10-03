import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Mail, NotebookText, Phone } from 'lucide-react';
import { APPOINTMENT_STATUSES, STATUS_LABELS, type AppointmentStatus } from '@shared/constants';
import type { AdminAppointmentDto } from '@shared/types';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatEgp, formatShortDate, formatTime } from '../../lib/format';
import { keys } from '../../lib/queries';
import { Avatar, Skeleton, StatusBadge } from '../../components/ui/Feedback';

export function useStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) => api.admin.setStatus(id, status),
    onSuccess: (a) => {
      toast.success(`Marked ${a.patientName} as ${STATUS_LABELS[a.status].toLowerCase()}`);
      void queryClient.invalidateQueries({ queryKey: keys.admin, predicate: (q) => q.queryKey[1] !== 'me' });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
    onError: (err) => toast.error('Status not changed', { description: err.message }),
  });
}

interface AppointmentListProps {
  items: AdminAppointmentDto[];
  showDate?: boolean;
}

export function AppointmentList({ items, showDate = true }: AppointmentListProps) {
  const status = useStatusMutation();
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((a) => {
        const pending = status.isPending && status.variables.id === a.id;
        return (
          <li
            key={a.id}
            className={cn(
              'grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[112px_1fr_auto] md:items-center',
              a.status === 'cancelled' && 'bg-slate-50/70',
            )}
          >
            <div className="flex items-baseline gap-2 md:block">
              <p className={cn('font-bold tabular-nums text-ink', a.status === 'cancelled' && 'text-slate-400 line-through')}>
                {formatTime(a.startsAt)}
                <span className="font-medium text-slate-400"> – {formatTime(a.endsAt)}</span>
              </p>
              {showDate && <p className="text-xs font-semibold text-slate-500">{formatShortDate(a.startsAt)}</p>}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="font-bold text-ink">{a.patientName}</p>
                <StatusBadge status={a.status} />
              </div>
              <p className="mt-0.5 text-sm text-slate-600">
                {a.service.name} · {formatEgp(a.priceEgp)}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <Avatar src={a.doctor.photoUrl} alt="" className="size-5" />
                  {a.doctor.name}
                </span>
                <a href={`tel:${a.patientPhone}`} className="inline-flex items-center gap-1 hover:text-brand-700">
                  <Phone className="size-3.5" aria-hidden />
                  {a.patientPhone}
                </a>
                <a href={`mailto:${a.patientEmail}`} className="inline-flex min-w-0 items-center gap-1 hover:text-brand-700">
                  <Mail className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{a.patientEmail}</span>
                </a>
                <span className="font-mono">{a.reference}</span>
              </div>
              {a.notes && (
                <p className="mt-1.5 flex gap-1.5 text-xs text-slate-500">
                  <NotebookText className="mt-px size-3.5 shrink-0" aria-hidden />
                  {a.notes}
                </p>
              )}
            </div>
            <label className="flex items-center gap-2 md:block">
              <span className="sr-only">Status for {a.patientName}</span>
              <select
                value={a.status}
                disabled={pending}
                onChange={(e) => status.mutate({ id: a.id, status: e.target.value as AppointmentStatus })}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-ink hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:opacity-60 md:w-36"
              >
                {APPOINTMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function AppointmentListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-slate-100" aria-label="Loading appointments">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[112px_1fr_auto] md:items-center">
          <Skeleton className="h-5 w-20" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-64 max-w-full" />
          </div>
          <Skeleton className="h-9 w-full md:w-36" />
        </li>
      ))}
    </ul>
  );
}
