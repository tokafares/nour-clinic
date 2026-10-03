import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { toast } from 'sonner';
import { CalendarPlus, CircleCheck, Copy, Info } from 'lucide-react';
import type { BookingDto } from '@shared/types';
import { BookingDetails } from '../components/BookingDetails';
import { ButtonLink, Button } from '../components/ui/Button';
import { Card } from '../components/ui/Feedback';

function isBookingState(state: unknown): state is { booking: BookingDto } {
  return typeof state === 'object' && state !== null && 'booking' in state;
}

export function ConfirmationPage() {
  const { reference = '' } = useParams();
  const location = useLocation();
  const booking = isBookingState(location.state) ? location.state.booking : null;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      toast.success('Reference copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Please note the reference down.');
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="animate-fade-in text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-brand-100 text-brand-700">
          <CircleCheck className="size-8" aria-hidden />
        </div>
        <h1 className="mt-5 font-display text-3xl font-semibold text-ink sm:text-4xl">You’re booked in</h1>
        <p className="mt-2 text-slate-600">
          {booking ? `See you soon, ${booking.patientName.split(' ')[0]}.` : 'Your appointment is confirmed.'} Keep your
          reference handy to manage or cancel your booking.
        </p>
      </div>

      <Card className="mt-8 p-5 sm:p-6">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-brand-300 bg-brand-50/60 p-5 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-800">Booking reference</p>
          <p className="font-mono text-3xl font-bold tracking-wider text-ink" aria-live="polite">
            {reference}
          </p>
          <Button variant="outline" size="sm" onClick={() => void copy()} icon={<Copy className="size-4" aria-hidden />}>
            {copied ? 'Copied' : 'Copy reference'}
          </Button>
        </div>
        {booking ? (
          <div className="mt-6">
            <BookingDetails booking={booking} />
          </div>
        ) : (
          <p className="mt-5 flex gap-2 text-sm text-slate-600">
            <Info className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            To see the full details, look the booking up with this reference and your phone number.
          </p>
        )}
        <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-ink">Before your visit</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Please arrive 10 minutes early to check in.</li>
            <li>Bring any recent X-rays or a list of your medications.</li>
            <li>Need to change plans? Cancel online so someone else can take the slot.</li>
          </ul>
        </div>
      </Card>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <ButtonLink to={`/manage?reference=${encodeURIComponent(reference)}`} variant="outline">
          Manage this booking
        </ButtonLink>
        <ButtonLink to="/book" variant="secondary">
          <CalendarPlus className="size-4" aria-hidden />
          Book another appointment
        </ButtonLink>
      </div>
      <p className="mt-6 text-center text-xs text-slate-500">
        Concept project: no confirmation email or SMS is sent. <Link to="/" className="font-semibold text-brand-700 hover:underline">Back to home</Link>
      </p>
    </div>
  );
}
