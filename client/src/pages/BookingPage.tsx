import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Stethoscope, Timer, UserRound } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { cn } from '../lib/cn';
import { formatDateString, formatDuration, formatEgp } from '../lib/format';
import { useDoctors, useServices } from '../lib/queries';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Feedback';
import { DateTimeStep, DetailsStep, DoctorStep, ServiceStep, validatePatient } from '../features/booking/steps';
import { useBookingDraft, type PatientDraft } from '../features/booking/useBookingDraft';

const STEPS = [
  { title: 'Treatment', heading: 'What would you like to book?' },
  { title: 'Dentist', heading: 'Who would you like to see?' },
  { title: 'Date & time', heading: 'When suits you?' },
  { title: 'Your details', heading: 'Your contact details' },
] as const;

const SLOT_ERROR_CODES = new Set(['SLOT_TAKEN', 'NOTICE_TOO_SHORT', 'SLOT_IN_PAST', 'INVALID_SLOT', 'OUTSIDE_BOOKING_WINDOW']);

export function BookingPage() {
  const { draft, update, reset } = useBookingDraft();
  const services = useServices();
  const doctors = useDoctors();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Partial<Record<keyof PatientDraft, string>>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const service = services.data?.find((s) => s.id === draft.serviceId);
  const doctor = typeof draft.doctorId === 'number' ? doctors.data?.find((d) => d.id === draft.doctorId) : undefined;
  const assignedDoctor =
    draft.doctorId === 'any' && draft.slot?.doctorIds.length === 1
      ? doctors.data?.find((d) => d.id === draft.slot?.doctorIds[0])
      : undefined;

  // Move focus to the step heading on step change so screen-reader and keyboard users keep their place.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [draft.step]);

  // If the chosen service disappeared (deactivated by staff), restart cleanly.
  useEffect(() => {
    if (services.data && draft.serviceId !== null && !service) update({ step: 0, serviceId: null, date: null, slot: null });
  }, [services.data, draft.serviceId, service, update]);

  const booking = useMutation({
    mutationFn: () => {
      if (!draft.serviceId || draft.doctorId === null || !draft.slot) throw new Error('Please complete every step.');
      return api.createBooking({
        serviceId: draft.serviceId,
        doctorId: draft.doctorId,
        startsAt: draft.slot.startsAt,
        ...draft.patient,
      });
    },
    onSuccess: (result) => {
      toast.dismiss();
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      reset();
      navigate(`/book/confirmed/${result.reference}`, { state: { booking: result } });
    },
    onError: (err) => {
      if (err instanceof ApiError && SLOT_ERROR_CODES.has(err.code)) {
        void queryClient.invalidateQueries({ queryKey: ['availability'] });
        setConflictNotice(err.message);
        update({ step: 2, slot: null });
        toast.error(err.status === 409 ? 'That time was just taken' : 'Please choose another time', {
          description: err.message,
        });
        return;
      }
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        const mapped: Partial<Record<keyof PatientDraft, string>> = {};
        for (const d of err.details) mapped[d.path as keyof PatientDraft] ??= d.message;
        setServerErrors(mapped);
      }
      toast.error('We couldn’t complete your booking', { description: err.message });
    },
  });

  const canContinue = [
    draft.serviceId !== null,
    draft.doctorId !== null,
    draft.slot !== null,
    Object.keys(validatePatient(draft.patient)).length === 0,
  ][draft.step];

  const goTo = (step: number) => update({ step });
  const next = () => update({ step: Math.min(draft.step + 1, 3) });
  const back = () => update({ step: Math.max(draft.step - 1, 0) });
  const step = STEPS[draft.step] ?? STEPS[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 sm:mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Online booking</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink sm:text-4xl">Book an appointment</h1>
      </div>

      <Stepper current={draft.step} onJump={goTo} />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <div className="px-4 pt-5 sm:px-6 sm:pt-6">
            <p className="text-xs font-semibold text-slate-500">
              Step {draft.step + 1} of {STEPS.length}
            </p>
            <h2 ref={headingRef} tabIndex={-1} className="mt-0.5 text-xl font-bold text-ink">
              {step.heading}
            </h2>
          </div>
          <div className="animate-fade-in px-4 py-5 sm:px-6" key={draft.step}>
            {draft.step === 0 && (
              <ServiceStep
                services={services.data}
                loading={services.isPending}
                error={services.error}
                onRetry={() => void services.refetch()}
                value={draft.serviceId}
                onSelect={(id) => {
                  const changed = id !== draft.serviceId;
                  update({ serviceId: id, step: 1, ...(changed ? { date: null, slot: null } : {}) });
                }}
              />
            )}
            {draft.step === 1 && (
              <DoctorStep
                doctors={doctors.data}
                loading={doctors.isPending}
                error={doctors.error}
                onRetry={() => void doctors.refetch()}
                value={draft.doctorId}
                onSelect={(id) => {
                  const changed = id !== draft.doctorId;
                  update({ doctorId: id, step: 2, ...(changed ? { date: null, slot: null } : {}) });
                }}
              />
            )}
            {draft.step === 2 && draft.serviceId !== null && draft.doctorId !== null && (
              <DateTimeStep
                serviceId={draft.serviceId}
                doctorId={draft.doctorId}
                date={draft.date}
                slot={draft.slot}
                conflictNotice={conflictNotice}
                onDate={(date) => update({ date, slot: null })}
                onSlot={(slot) => {
                  setConflictNotice(null);
                  update({ slot });
                }}
              />
            )}
            {draft.step === 3 && (
              <DetailsStep
                values={draft.patient}
                onChange={(patient) => {
                  setServerErrors({});
                  update({ patient });
                }}
                onSubmit={() => booking.mutate()}
                submitting={booking.isPending}
                serverErrors={serverErrors}
              />
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-6">
            <Button
              variant="ghost"
              onClick={back}
              disabled={draft.step === 0 || booking.isPending}
              icon={<ArrowLeft className="size-4" aria-hidden />}
            >
              Back
            </Button>
            {draft.step < 3 ? (
              <Button onClick={next} disabled={!canContinue}>
                Continue
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            ) : (
              <Button type="submit" form="details-form" loading={booking.isPending}>
                Confirm booking
              </Button>
            )}
          </div>
        </Card>

        <aside className="lg:sticky lg:top-24" aria-label="Booking summary">
          <Card className="p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Your appointment</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <SummaryRow icon={Stethoscope} label="Treatment" onEdit={draft.step > 0 ? () => goTo(0) : undefined}>
                {service ? (
                  <>
                    <span className="block font-semibold text-ink">{service.name}</span>
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <Timer className="size-3.5" aria-hidden />
                      {formatDuration(service.durationMin)}
                    </span>
                  </>
                ) : null}
              </SummaryRow>
              <SummaryRow icon={UserRound} label="Dentist" onEdit={draft.step > 1 ? () => goTo(1) : undefined}>
                {draft.doctorId === 'any' ? (
                  <span className="font-semibold text-ink">
                    {assignedDoctor ? assignedDoctor.name : 'Any available dentist'}
                  </span>
                ) : doctor ? (
                  <span className="font-semibold text-ink">{doctor.name}</span>
                ) : null}
              </SummaryRow>
              <SummaryRow icon={CalendarDays} label="Date & time" onEdit={draft.step > 2 ? () => goTo(2) : undefined}>
                {draft.date ? (
                  <span className="font-semibold text-ink">
                    {formatDateString(draft.date)}
                    {draft.slot && <span className="block text-brand-700">{draft.slot.label} (Cairo time)</span>}
                  </span>
                ) : null}
              </SummaryRow>
            </dl>
            <div className="mt-5 flex items-baseline justify-between border-t border-slate-100 pt-4">
              <span className="text-sm text-slate-500">Total, paid at the clinic</span>
              <span className="text-lg font-bold text-ink">{service ? formatEgp(service.priceEgp) : '—'}</span>
            </div>
          </Card>
          <p className="mt-3 px-1 text-xs text-slate-500">
            Free cancellation online, any time before your appointment.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Stepper({ current, onJump }: { current: number; onJump: (step: number) => void }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3" aria-label="Booking progress">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.title} className="flex flex-1 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={!done}
              aria-current={active ? 'step' : undefined}
              className="flex min-w-0 items-center gap-2 disabled:cursor-default"
            >
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors',
                  done && 'bg-brand-700 text-white',
                  active && 'bg-white text-brand-800 ring-2 ring-brand-700',
                  !done && !active && 'bg-slate-200 text-slate-500',
                )}
              >
                {done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              <span
                className={cn(
                  'hidden truncate text-sm font-semibold sm:block',
                  active ? 'text-ink' : done ? 'text-brand-800' : 'text-slate-400',
                )}
              >
                {s.title}
              </span>
              <span className="sr-only">
                {s.title}
                {done ? ' (completed)' : active ? ' (current step)' : ''}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <span className={cn('h-0.5 flex-1 rounded-full', done ? 'bg-brand-600' : 'bg-slate-200')} aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  onEdit,
  children,
}: {
  icon: typeof Stethoscope;
  label: string;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="flex items-center justify-between text-xs font-semibold text-slate-500">
          {label}
          {onEdit && (
            <button type="button" onClick={onEdit} className="text-xs font-semibold text-brand-700 hover:underline">
              Change
            </button>
          )}
        </dt>
        <dd className="mt-0.5">{children ?? <span className="text-slate-400">Not chosen yet</span>}</dd>
      </div>
    </div>
  );
}
