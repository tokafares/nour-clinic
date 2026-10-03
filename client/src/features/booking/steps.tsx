import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, CalendarX2, Clock, Sun, Sunrise, Sunset, Timer, Users } from 'lucide-react';
import { patientDetailsSchema, PHONE_HINT } from '@shared/schemas';
import type { DoctorDto, ServiceDto, SlotDto } from '@shared/types';
import { api, type DoctorChoice } from '../../lib/api';
import { cn } from '../../lib/cn';
import { dayParts, formatDateString, formatDuration, formatEgp, workingDaysSummary } from '../../lib/format';
import { errorMessage } from '../../lib/queries';
import { Avatar, Card, EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input, Textarea } from '../../components/ui/Field';
import type { PatientDraft } from './useBookingDraft';

const optionClass = (selected: boolean): string =>
  cn(
    'relative w-full rounded-2xl border bg-white p-4 text-left transition-all',
    selected
      ? 'border-brand-600 ring-4 ring-brand-100'
      : 'border-slate-200 hover:border-brand-300 hover:shadow-soft',
  );

function SelectedTick({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="absolute right-3 top-3 grid size-6 place-items-center rounded-full bg-brand-700 text-white">
      <Check className="size-3.5" strokeWidth={3} aria-hidden />
    </span>
  );
}

// ---------- Step 1: service ----------

interface ServiceStepProps {
  services: ServiceDto[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  value: number | null;
  onSelect: (id: number) => void;
}

export function ServiceStep({ services, loading, error, onRetry, value, onSelect }: ServiceStepProps) {
  if (error) return <ErrorState message={errorMessage(error)} onRetry={onRetry} />;
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Treatment">
      {loading &&
        Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      {services?.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={value === s.id}
          onClick={() => onSelect(s.id)}
          className={optionClass(value === s.id)}
        >
          <SelectedTick show={value === s.id} />
          <span className="block pr-8 font-bold text-ink">{s.name}</span>
          <span className="mt-1 line-clamp-2 block text-sm text-slate-500">{s.description}</span>
          <span className="mt-3 flex items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Timer className="size-4" aria-hidden />
              {formatDuration(s.durationMin)}
            </span>
            <span className="font-bold text-brand-800">{formatEgp(s.priceEgp)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------- Step 2: dentist ----------

interface DoctorStepProps {
  doctors: DoctorDto[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  value: DoctorChoice | null;
  onSelect: (id: DoctorChoice) => void;
}

export function DoctorStep({ doctors, loading, error, onRetry, value, onSelect }: DoctorStepProps) {
  if (error) return <ErrorState message={errorMessage(error)} onRetry={onRetry} />;
  return (
    <div className="grid gap-3" role="radiogroup" aria-label="Dentist">
      <button
        type="button"
        role="radio"
        aria-checked={value === 'any'}
        onClick={() => onSelect('any')}
        className={cn(optionClass(value === 'any'), 'flex items-center gap-4')}
      >
        <SelectedTick show={value === 'any'} />
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
          <Users className="size-6" aria-hidden />
        </span>
        <span className="pr-8">
          <span className="block font-bold text-ink">Any available dentist</span>
          <span className="block text-sm text-slate-500">See the most open times. We’ll assign whoever is free.</span>
        </span>
      </button>
      {loading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      {doctors?.map((d) => (
        <button
          key={d.id}
          type="button"
          role="radio"
          aria-checked={value === d.id}
          onClick={() => onSelect(d.id)}
          className={cn(optionClass(value === d.id), 'flex items-center gap-4')}
        >
          <SelectedTick show={value === d.id} />
          <Avatar src={d.photoUrl} alt="" className="size-14" />
          <span className="min-w-0 pr-8">
            <span className="block font-bold text-ink">{d.name}</span>
            <span className="block text-sm font-semibold text-brand-700">{d.specialty}</span>
            <span className="block truncate text-xs text-slate-500">
              {workingDaysSummary(d.workingHours.map((h) => h.weekday))}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------- Step 3: date & time ----------

interface DateTimeStepProps {
  serviceId: number;
  doctorId: DoctorChoice;
  date: string | null;
  slot: SlotDto | null;
  onDate: (date: string) => void;
  onSlot: (slot: SlotDto) => void;
  conflictNotice: string | null;
}

const periods = [
  { key: 'morning', label: 'Morning', icon: Sunrise, test: (m: number) => m < 12 * 60 },
  { key: 'afternoon', label: 'Afternoon', icon: Sun, test: (m: number) => m >= 12 * 60 && m < 17 * 60 },
  { key: 'evening', label: 'Evening', icon: Sunset, test: (m: number) => m >= 17 * 60 },
] as const;

export function DateTimeStep({ serviceId, doctorId, date, slot, onDate, onSlot, conflictNotice }: DateTimeStepProps) {
  const days = useQuery({
    queryKey: ['availability', 'days', serviceId, doctorId],
    queryFn: () => api.availabilityDays(serviceId, doctorId),
    staleTime: 15_000,
  });
  const slots = useQuery({
    queryKey: ['availability', 'slots', serviceId, doctorId, date],
    queryFn: () => api.slots(serviceId, doctorId, date ?? ''),
    enabled: date !== null,
    staleTime: 15_000,
  });

  const grouped = useMemo(() => {
    const list = slots.data ?? [];
    return periods
      .map((p) => ({
        ...p,
        slots: list.filter((s) => {
          const [h, m] = s.label.split(':').map(Number);
          return p.test((h ?? 0) * 60 + (m ?? 0));
        }),
      }))
      .filter((p) => p.slots.length > 0);
  }, [slots.data]);

  return (
    <div className="space-y-6">
      {conflictNotice && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {conflictNotice}
        </div>
      )}
      <div>
        <h3 className="mb-3 text-sm font-bold text-ink">Choose a day</h3>
        {days.isError ? (
          <ErrorState message={errorMessage(days.error)} onRetry={() => void days.refetch()} />
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7" role="radiogroup" aria-label="Day">
            {days.isPending
              ? Array.from({ length: 21 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)
              : days.data.map((d) => {
                  const parts = dayParts(d.date);
                  const disabled = d.availableSlots === 0;
                  const selected = d.date === date;
                  return (
                    <button
                      key={d.date}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${formatDateString(d.date)}${disabled ? (d.open ? ', fully booked' : ', closed') : `, ${d.availableSlots} times available`}`}
                      disabled={disabled}
                      onClick={() => onDate(d.date)}
                      className={cn(
                        'flex h-[74px] flex-col items-center justify-center rounded-xl border text-center transition-colors',
                        selected
                          ? 'border-brand-700 bg-brand-700 text-white'
                          : disabled
                            ? 'cursor-not-allowed border-transparent bg-slate-100/70 text-slate-400'
                            : 'border-slate-200 bg-white hover:border-brand-400 hover:bg-brand-50',
                      )}
                    >
                      <span className={cn('text-[11px] font-semibold uppercase', selected ? 'text-brand-100' : 'opacity-70')}>
                        {parts.weekday}
                      </span>
                      <span className="text-lg leading-tight font-bold">{parts.day}</span>
                      <span className={cn('text-[10px] font-medium', selected ? 'text-brand-100' : 'opacity-70')}>
                        {disabled ? (d.open ? 'Full' : 'Closed') : parts.month}
                      </span>
                    </button>
                  );
                })}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-bold text-ink">
          {date ? `Available times on ${formatDateString(date)}` : 'Available times'}
        </h3>
        {!date ? (
          <Card className="border-dashed shadow-none">
            <EmptyState icon={Clock} title="Pick a day first" description="Open times appear here once you choose a day." className="py-8" />
          </Card>
        ) : slots.isError ? (
          <ErrorState message={errorMessage(slots.error)} onRetry={() => void slots.refetch()} />
        ) : slots.isPending ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-11 rounded-xl" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <Card className="border-dashed shadow-none">
            <EmptyState
              icon={CalendarX2}
              title="No times left on this day"
              description="Someone may have just booked the last slot. Try another day."
              className="py-8"
            />
          </Card>
        ) : (
          <div className="space-y-5">
            {grouped.map((g) => (
              <div key={g.key}>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <g.icon className="size-3.5" aria-hidden />
                  {g.label}
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label={`${g.label} times`}>
                  {g.slots.map((s) => {
                    const selected = slot?.startsAt === s.startsAt;
                    return (
                      <button
                        key={s.startsAt}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onSlot(s)}
                        className={cn(
                          'h-11 rounded-xl border text-sm font-bold tabular-nums transition-colors',
                          selected
                            ? 'border-brand-700 bg-brand-700 text-white'
                            : 'border-slate-200 bg-white text-ink hover:border-brand-400 hover:bg-brand-50',
                        )}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Step 4: patient details ----------

type FieldErrors = Partial<Record<keyof PatientDraft, string>>;

export function validatePatient(values: PatientDraft): FieldErrors {
  const result = patientDetailsSchema.safeParse(values);
  if (result.success) return {};
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof PatientDraft | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

interface DetailsStepProps {
  values: PatientDraft;
  onChange: (values: PatientDraft) => void;
  onSubmit: () => void;
  submitting: boolean;
  serverErrors: FieldErrors;
}

export function DetailsStep({ values, onChange, onSubmit, submitting, serverErrors }: DetailsStepProps) {
  const [touched, setTouched] = useState<Partial<Record<keyof PatientDraft, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const clientErrors = validatePatient(values);
  const errorFor = (k: keyof PatientDraft): string | undefined =>
    (attempted || touched[k] ? clientErrors[k] : undefined) ?? serverErrors[k];

  const set = (k: keyof PatientDraft) => (e: { target: { value: string } }) => onChange({ ...values, [k]: e.target.value });
  const blur = (k: keyof PatientDraft) => () => setTouched((t) => ({ ...t, [k]: true }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (Object.keys(clientErrors).length === 0) onSubmit();
    else {
      const first = Object.keys(clientErrors)[0];
      document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    }
  };

  return (
    <form id="details-form" noValidate onSubmit={handleSubmit}>
      <fieldset disabled={submitting} className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" error={errorFor('patientName')} className="sm:col-span-2">
        {(p) => (
          <Input {...p} name="patientName" autoComplete="name" value={values.patientName} onChange={set('patientName')} onBlur={blur('patientName')} invalid={p['aria-invalid']} placeholder="e.g. Mariam Adel" />
        )}
      </Field>
      <Field label="Mobile number" error={errorFor('patientPhone')} hint={`We use this with your reference to find your booking. ${PHONE_HINT}.`}>
        {(p) => (
          <Input {...p} name="patientPhone" type="tel" inputMode="tel" autoComplete="tel" value={values.patientPhone} onChange={set('patientPhone')} onBlur={blur('patientPhone')} invalid={p['aria-invalid']} placeholder="010 0123 4567" />
        )}
      </Field>
      <Field label="Email" error={errorFor('patientEmail')}>
        {(p) => (
          <Input {...p} name="patientEmail" type="email" inputMode="email" autoComplete="email" value={values.patientEmail} onChange={set('patientEmail')} onBlur={blur('patientEmail')} invalid={p['aria-invalid']} placeholder="you@example.com" />
        )}
      </Field>
      <Field label="Anything we should know?" optional error={errorFor('notes')} hint={`${values.notes.length}/500 · e.g. sensitivity, anxiety, medical conditions`} className="sm:col-span-2">
        {(p) => (
          <Textarea {...p} name="notes" value={values.notes} onChange={set('notes')} onBlur={blur('notes')} invalid={p['aria-invalid']} maxLength={500} rows={3} />
        )}
      </Field>
      <p className="text-xs text-slate-500 sm:col-span-2">
        This is a concept project: please don’t enter real medical information.
      </p>
      </fieldset>
    </form>
  );
}
