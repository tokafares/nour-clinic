import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, UsersRound } from 'lucide-react';
import { WEEKDAY_LABELS } from '@shared/constants';
import { workingHoursSchema } from '@shared/schemas';
import { labelToMinutes, minutesToLabel } from '@shared/time';
import type { DoctorDto, WorkingHoursDto } from '@shared/types';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { errorMessage, keys } from '../../lib/queries';
import { PageHeader } from '../../components/AdminLayout';
import { Button } from '../../components/ui/Button';
import { Avatar, Card, EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Input } from '../../components/ui/Field';

// Egyptian week order: Saturday first.
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

interface DayRow {
  enabled: boolean;
  start: string;
  end: string;
}

const toRows = (hours: WorkingHoursDto[]): Record<number, DayRow> =>
  Object.fromEntries(
    WEEK_ORDER.map((d) => {
      const h = hours.find((x) => x.weekday === d);
      return [d, h ? { enabled: true, start: minutesToLabel(h.startMin), end: minutesToLabel(h.endMin) } : { enabled: false, start: '09:00', end: '17:00' }];
    }),
  );

export function DoctorsPage() {
  const doctors = useQuery({ queryKey: ['admin', 'doctors'], queryFn: api.admin.doctors });
  return (
    <>
      <PageHeader title="Dentists & working hours" description="Weekly hours drive which times patients can book. Existing appointments are kept." />
      {doctors.isPending ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i} className="p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-12 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="mt-5 h-56 w-full" />
            </Card>
          ))}
        </div>
      ) : doctors.isError ? (
        <Card>
          <ErrorState message={errorMessage(doctors.error)} onRetry={() => void doctors.refetch()} />
        </Card>
      ) : doctors.data.length === 0 ? (
        <Card>
          <EmptyState icon={UsersRound} title="No dentists yet" description="Run the seed script to add the demo team." />
        </Card>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {doctors.data.map((d) => (
            <DoctorHoursCard key={d.id} doctor={d} />
          ))}
        </div>
      )}
    </>
  );
}

function DoctorHoursCard({ doctor }: { doctor: DoctorDto }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState(() => toRows(doctor.workingHours));
  const [error, setError] = useState<string | null>(null);
  const initial = JSON.stringify(toRows(doctor.workingHours));
  const dirty = JSON.stringify(rows) !== initial;

  const save = useMutation({
    mutationFn: (hours: WorkingHoursDto[]) => api.admin.saveHours(doctor.id, hours),
    onSuccess: (updated) => {
      setRows(toRows(updated.workingHours));
      toast.success(`Saved hours for ${updated.name}`);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'doctors'] });
      void queryClient.invalidateQueries({ queryKey: keys.doctors });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
    onError: (err) => toast.error('Could not save hours', { description: err.message }),
  });

  const update = (day: number, patch: Partial<DayRow>) => {
    setError(null);
    setRows((r) => ({ ...r, [day]: { ...(r[day] as DayRow), ...patch } }));
  };

  const submit = () => {
    const hours = WEEK_ORDER.filter((d) => rows[d]?.enabled).map((d) => ({
      weekday: d,
      startMin: labelToMinutes(rows[d]?.start ?? '00:00'),
      endMin: labelToMinutes(rows[d]?.end ?? '00:00'),
    }));
    const parsed = workingHoursSchema.safeParse(hours);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const idx = typeof issue?.path[0] === 'number' ? issue.path[0] : -1;
      const day = hours[idx]?.weekday;
      setError(`${day !== undefined ? `${WEEKDAY_LABELS[day]}: ` : ''}${issue?.message ?? 'Invalid hours'}`);
      return;
    }
    save.mutate(parsed.data);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
        <Avatar src={doctor.photoUrl} alt="" className="size-12" />
        <div className="min-w-0">
          <p className="truncate font-bold text-ink">{doctor.name}</p>
          <p className="truncate text-sm text-brand-700">{doctor.specialty}</p>
        </div>
      </div>
      <ul className="divide-y divide-slate-100">
        {WEEK_ORDER.map((d) => {
          const row = rows[d] as DayRow;
          return (
            <li key={d} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-5">
              <label className="flex w-32 items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => update(d, { enabled: e.target.checked })}
                  className="size-4 rounded accent-brand-700"
                />
                <span className={cn('text-sm font-semibold', row.enabled ? 'text-ink' : 'text-slate-400')}>{WEEKDAY_LABELS[d]}</span>
              </label>
              {row.enabled ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    type="time"
                    step={1800}
                    value={row.start}
                    onChange={(e) => update(d, { start: e.target.value })}
                    aria-label={`${WEEKDAY_LABELS[d]} start time`}
                    className="h-9 min-w-0 flex-1 px-2 text-sm"
                  />
                  <span className="text-slate-400" aria-hidden>
                    to
                  </span>
                  <Input
                    type="time"
                    step={1800}
                    value={row.end}
                    onChange={(e) => update(d, { end: e.target.value })}
                    aria-label={`${WEEKDAY_LABELS[d]} end time`}
                    className="h-9 min-w-0 flex-1 px-2 text-sm"
                  />
                </div>
              ) : (
                <span className="flex-1 text-sm text-slate-400">Day off</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
        {error && (
          <p role="alert" className="mr-auto text-sm text-rose-600">
            {error}
          </p>
        )}
        {dirty && !error && <p className="mr-auto text-xs text-slate-500">Unsaved changes</p>}
        <Button size="sm" variant="ghost" disabled={!dirty || save.isPending} onClick={() => setRows(toRows(doctor.workingHours))}>
          Reset
        </Button>
        <Button size="sm" onClick={submit} disabled={!dirty} loading={save.isPending} icon={<Save className="size-4" aria-hidden />}>
          Save hours
        </Button>
      </div>
    </Card>
  );
}
