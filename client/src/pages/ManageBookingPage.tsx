import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarX2, Search } from 'lucide-react';
import { lookupBookingSchema } from '@shared/schemas';
import type { BookingDto } from '@shared/types';
import { api } from '../lib/api';
import { BookingDetails } from '../components/BookingDetails';
import { Button, ButtonLink } from '../components/ui/Button';
import { Card } from '../components/ui/Feedback';
import { Dialog } from '../components/ui/Dialog';
import { Field, Input } from '../components/ui/Field';

export function ManageBookingPage() {
  const [params] = useSearchParams();
  const [reference, setReference] = useState(params.get('reference') ?? '');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ reference?: string; phone?: string }>({});
  const [booking, setBooking] = useState<BookingDto | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const queryClient = useQueryClient();

  const lookup = useMutation({
    mutationFn: (input: { reference: string; phone: string }) => api.lookupBooking(input.reference, input.phone),
    onSuccess: setBooking,
    onError: (err) => {
      setBooking(null);
      toast.error('Booking not found', { description: err.message });
    },
  });

  const cancel = useMutation({
    mutationFn: () => {
      const parsed = lookupBookingSchema.parse({ reference, phone });
      return api.cancelBooking(parsed.reference, parsed.phone);
    },
    onSuccess: (updated) => {
      setBooking(updated);
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      toast.success('Your appointment has been cancelled', { description: 'The time is now free for other patients.' });
    },
    onError: (err) => {
      setConfirmOpen(false);
      toast.error('Could not cancel', { description: err.message });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = lookupBookingSchema.safeParse({ reference, phone });
    if (!result.success) {
      const next: typeof errors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if ((key === 'reference' || key === 'phone') && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    lookup.mutate(result.data);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Your booking</p>
      <h1 className="mt-1 font-display text-3xl font-semibold text-ink sm:text-4xl">Find or cancel a booking</h1>
      <p className="mt-2 text-slate-600">Enter the reference from your confirmation and the phone number you booked with.</p>

      <Card className="mt-8 p-5 sm:p-6">
        <form noValidate onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
          <Field label="Reference" error={errors.reference}>
            {(p) => (
              <Input
                {...p}
                invalid={p['aria-invalid']}
                value={reference}
                onChange={(e) => setReference(e.target.value.toUpperCase())}
                placeholder="NDC-AB12CD"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="font-mono uppercase"
              />
            )}
          </Field>
          <Field label="Phone number" error={errors.phone}>
            {(p) => (
              <Input
                {...p}
                invalid={p['aria-invalid']}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010 0123 4567"
              />
            )}
          </Field>
          <Button type="submit" loading={lookup.isPending} className="sm:mt-[26px]" icon={<Search className="size-4" aria-hidden />}>
            Find
          </Button>
        </form>
      </Card>

      {booking && (
        <Card className="mt-6 animate-fade-in p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-lg font-bold tracking-wider text-ink">{booking.reference}</p>
          </div>
          <BookingDetails booking={booking} />
          <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            {booking.canCancel ? (
              <Button variant="danger" onClick={() => setConfirmOpen(true)} icon={<CalendarX2 className="size-4" aria-hidden />}>
                Cancel appointment
              </Button>
            ) : (
              <p className="text-sm text-slate-500 sm:mr-auto sm:self-center">
                {booking.status === 'cancelled'
                  ? 'This appointment was cancelled.'
                  : 'This appointment can no longer be changed online. Please call the clinic.'}
              </p>
            )}
            <ButtonLink to="/book" variant="outline">
              Book a new time
            </ButtonLink>
          </div>
        </Card>
      )}

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Cancel this appointment?"
        description="The time will be released to other patients. This can’t be undone online."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={cancel.isPending}>
              Keep it
            </Button>
            <Button variant="danger" onClick={() => cancel.mutate()} loading={cancel.isPending}>
              Yes, cancel
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          You can always book a new appointment afterwards. Cancelling early helps another patient get seen sooner.
        </p>
      </Dialog>
    </div>
  );
}
