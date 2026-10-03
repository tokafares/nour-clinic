import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, SearchX, Search, X } from 'lucide-react';
import { APPOINTMENT_STATUSES, STATUS_LABELS, type AppointmentStatus } from '@shared/constants';
import { toZonedDateString } from '@shared/time';
import { api, type AppointmentQuery } from '../../lib/api';
import { cn } from '../../lib/cn';
import { errorMessage, useDoctors } from '../../lib/queries';
import { PageHeader } from '../../components/AdminLayout';
import { Button } from '../../components/ui/Button';
import { Card, EmptyState, ErrorState } from '../../components/ui/Feedback';
import { Input, Select } from '../../components/ui/Field';
import { AppointmentList, AppointmentListSkeleton } from '../../features/admin/AppointmentList';

type View = 'today' | 'upcoming' | 'all' | 'date';
const VIEWS: { value: View; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'all', label: 'All' },
  { value: 'date', label: 'Pick a date' },
];
const PAGE_SIZE = 20;

const isStatus = (v: string | null): v is AppointmentStatus =>
  v !== null && (APPOINTMENT_STATUSES as readonly string[]).includes(v);

export function AppointmentsPage() {
  const [params, setParams] = useSearchParams();
  const doctors = useDoctors();
  const today = toZonedDateString(new Date());

  const view = (VIEWS.find((v) => v.value === params.get('view'))?.value ?? 'upcoming') as View;
  const date = params.get('date') ?? today;
  const doctorId = Number(params.get('doctor')) || undefined;
  const status = isStatus(params.get('status')) ? (params.get('status') as AppointmentStatus) : undefined;
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);

  const setParam = (patch: Record<string, string | undefined>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined || v === '') next.delete(k);
          else next.set(k, v);
        }
        if (!('page' in patch)) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  // Debounce the search box into the URL.
  useEffect(() => {
    if (search.trim() === q) return;
    const t = setTimeout(() => setParam({ q: search.trim() || undefined }), 300);
    return () => clearTimeout(t);
  }, [search]);

  const query: AppointmentQuery = {
    ...(view === 'today' ? { date: today } : view === 'date' ? { date } : view === 'upcoming' ? { from: today } : {}),
    doctorId,
    status,
    q: q || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const list = useQuery({
    queryKey: ['admin', 'appointments', query],
    queryFn: () => api.admin.appointments(query),
    placeholderData: keepPreviousData,
  });

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;
  const hasFilters = Boolean(doctorId || status || q);

  return (
    <>
      <PageHeader title="Appointments" description="Search, filter and update appointment status." />

      <Card className="mb-4 p-3 sm:p-4">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Date range">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              role="tab"
              aria-selected={view === v.value}
              onClick={() => setParam({ view: v.value, date: v.value === 'date' ? date : undefined })}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                view === v.value ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
          <label className="relative block sm:col-span-2 lg:col-span-1">
            <span className="sr-only">Search patients</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email or reference"
              className="pl-9"
            />
          </label>
          <label className="block">
            <span className="sr-only">Dentist</span>
            <Select value={doctorId ?? ''} onChange={(e) => setParam({ doctor: e.target.value || undefined })}>
              <option value="">All dentists</option>
              {doctors.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="sr-only">Status</span>
            <Select value={status ?? ''} onChange={(e) => setParam({ status: e.target.value || undefined })}>
              <option value="">All statuses</option>
              {APPOINTMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </label>
          {view === 'date' ? (
            <label className="block sm:col-span-2 lg:col-span-1">
              <span className="sr-only">Date</span>
              <Input type="date" value={date} onChange={(e) => setParam({ date: e.target.value || today })} />
            </label>
          ) : (
            hasFilters && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch('');
                  setParam({ doctor: undefined, status: undefined, q: undefined });
                }}
                icon={<X className="size-4" aria-hidden />}
              >
                Clear
              </Button>
            )
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm sm:px-5">
          <span className="font-semibold text-ink" aria-live="polite">
            {list.data ? `${list.data.total} appointment${list.data.total === 1 ? '' : 's'}` : 'Loading…'}
          </span>
          {list.isFetching && !list.isPending && <span className="text-xs text-slate-400">Updating…</span>}
        </div>
        {list.isPending ? (
          <AppointmentListSkeleton rows={6} />
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No appointments match"
            description={hasFilters ? 'Try clearing a filter or searching for something else.' : 'Nothing is booked in this range yet.'}
          />
        ) : (
          <AppointmentList items={list.data.items} />
        )}
        {list.data && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-5">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setParam({ page: String(page - 1) })}
              icon={<ChevronLeft className="size-4" aria-hidden />}
            >
              Previous
            </Button>
            <span className="text-sm text-slate-500">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setParam({ page: String(page + 1) })}>
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
