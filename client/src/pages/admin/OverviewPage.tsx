import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarCheck2, CalendarClock, CalendarDays, CalendarOff, Percent } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { addDays, toZonedDateString } from '@shared/time';
import { api } from '../../lib/api';
import { dayParts, formatDateString, formatTime } from '../../lib/format';
import { errorMessage } from '../../lib/queries';
import { PageHeader } from '../../components/AdminLayout';
import { ButtonLink } from '../../components/ui/Button';
import { Card, EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { AppointmentList, AppointmentListSkeleton } from '../../features/admin/AppointmentList';

export function OverviewPage() {
  const today = toZonedDateString(new Date());
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: api.admin.stats });
  const todays = useQuery({
    queryKey: ['admin', 'appointments', { date: today }],
    queryFn: () => api.admin.appointments({ date: today, pageSize: 100 }),
  });
  const upcoming = useQuery({
    queryKey: ['admin', 'appointments', { from: addDays(today, 1), status: 'confirmed', pageSize: 6 }],
    queryFn: () => api.admin.appointments({ from: addDays(today, 1), status: 'confirmed', pageSize: 6 }),
  });

  const cards: { label: string; icon: LucideIcon; value?: string; hint?: string }[] = [
    {
      label: 'Today',
      icon: CalendarCheck2,
      value: stats.data && String(stats.data.today),
      hint: stats.data && `${stats.data.todayCompleted} completed · excl. cancelled`,
    },
    { label: 'This week', icon: CalendarDays, value: stats.data && String(stats.data.thisWeek), hint: 'Saturday to Friday' },
    { label: 'Upcoming', icon: CalendarClock, value: stats.data && String(stats.data.upcoming), hint: 'Confirmed, not yet seen' },
    {
      label: 'Cancellation rate',
      icon: Percent,
      value: stats.data && `${stats.data.cancellationRate}%`,
      hint: stats.data && `Bookings made in the last ${stats.data.cancellationWindowDays} days`,
    },
  ];

  return (
    <>
      <PageHeader title="Overview" description={formatDateString(today)} />

      {stats.isError ? (
        <Card className="mb-6">
          <ErrorState message={errorMessage(stats.error)} onRetry={() => void stats.refetch()} />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((c) => (
            <Card key={c.label} className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 sm:text-sm">{c.label}</p>
                <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <c.icon className="size-4" aria-hidden />
                </span>
              </div>
              {c.value === undefined ? (
                <>
                  <Skeleton className="mt-3 h-8 w-16" />
                  <Skeleton className="mt-2 h-3 w-24" />
                </>
              ) : (
                <>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{c.value}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{c.hint}</p>
                </>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5">
            <h2 className="font-bold text-ink">Today’s schedule</h2>
            {todays.data && <span className="text-sm text-slate-500">{todays.data.total} appointments</span>}
          </div>
          {todays.isPending ? (
            <AppointmentListSkeleton />
          ) : todays.isError ? (
            <ErrorState message={errorMessage(todays.error)} onRetry={() => void todays.refetch()} />
          ) : todays.data.items.length === 0 ? (
            <EmptyState icon={CalendarOff} title="Nothing booked today" description="Enjoy the quiet, or check upcoming days." />
          ) : (
            <AppointmentList items={todays.data.items} showDate={false} />
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5">
            <h2 className="font-bold text-ink">Coming up</h2>
            <ButtonLink to="/admin/appointments?view=upcoming" variant="ghost" size="sm">
              View all
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
          {upcoming.isPending ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : upcoming.isError ? (
            <ErrorState message={errorMessage(upcoming.error)} onRetry={() => void upcoming.refetch()} />
          ) : upcoming.data.items.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No upcoming bookings" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.data.items.map((a) => {
                const day = dayParts(toZonedDateString(new Date(a.startsAt)));
                return (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <div className="w-12 shrink-0 rounded-lg bg-brand-50 py-1 text-center">
                      <p className="text-[10px] font-bold uppercase text-brand-700">{day.weekday}</p>
                      <p className="text-sm leading-tight font-bold text-ink">
                        {day.day} {day.month}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{a.patientName}</p>
                      <p className="truncate text-xs text-slate-500">
                        {a.service.name} · {a.doctor.name}
                      </p>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-brand-800">{formatTime(a.startsAt)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
