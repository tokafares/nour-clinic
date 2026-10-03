import { ArrowRight, CalendarCheck, CalendarClock, ShieldCheck, Sparkles, Stethoscope, Timer } from 'lucide-react';
import { ButtonLink } from '../components/ui/Button';
import { Card, ErrorState, Skeleton } from '../components/ui/Feedback';
import { errorMessage, useDoctors, useServices } from '../lib/queries';
import { formatDuration, formatEgp, workingDaysSummary } from '../lib/format';

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1400&q=80&auto=format&fit=crop';

export function HomePage() {
  return (
    <>
      <Hero />
      <Services />
      <Dentists />
      <HowItWorks />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.1fr_1fr] md:py-20">
        <div className="animate-fade-in">
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-800">
            <ShieldCheck className="size-3.5" aria-hidden />
            Heliopolis, Cairo
          </p>
          <h1 className="mt-5 font-display text-4xl leading-[1.08] font-semibold tracking-tight text-ink sm:text-5xl lg:text-6xl">
            Calm, careful dentistry, <em className="text-brand-700">booked in minutes.</em>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-slate-600">
            Choose a treatment, pick your dentist and a time that suits you. You get a confirmation straight away,
            and you can cancel online whenever plans change.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink to="/book" size="lg">
              Book an appointment
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink to="/manage" size="lg" variant="outline">
              Manage a booking
            </ButtonLink>
          </div>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-slate-100 pt-6">
            {[
              ['12+', 'years of care'],
              ['3', 'specialists'],
              ['4.9', 'patient rating'],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="sr-only">{label}</dt>
                <dd className="font-display text-3xl font-semibold text-brand-700">{value}</dd>
                <dd className="text-xs font-medium text-slate-500">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="relative">
          <div className="absolute -inset-4 -z-0 rounded-[2rem] bg-brand-100/60 md:-inset-6" aria-hidden />
          <img
            src={HERO_IMAGE}
            alt="A bright, modern treatment room at Nour Dental Clinic"
            className="relative aspect-[4/3] w-full rounded-3xl object-cover shadow-lift"
            fetchPriority="high"
          />
          <div className="absolute -bottom-5 left-4 flex items-center gap-3 rounded-2xl bg-white p-3 pr-5 shadow-lift sm:left-6">
            <div className="grid size-10 place-items-center rounded-xl bg-brand-700 text-white">
              <CalendarCheck className="size-5" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-bold text-ink">Same-week appointments</p>
              <p className="text-xs text-slate-500">Book up to 21 days ahead</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">{eyebrow}</p>
      <h2 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">{title}</h2>
      <p className="mt-3 text-slate-600">{text}</p>
    </div>
  );
}

function Services() {
  const { data, isPending, isError, error, refetch } = useServices();
  return (
    <section id="services" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Treatments"
          title="Clear prices, no surprises"
          text="Every price below is the full cost of the visit. If you need further treatment, we explain the options and costs first."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isPending &&
            Array.from({ length: 5 }, (_, i) => (
              <Card key={i} className="p-6">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="mt-3 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-3/4" />
                <Skeleton className="mt-6 h-5 w-1/3" />
              </Card>
            ))}
          {isError && (
            <Card className="sm:col-span-2 lg:col-span-3">
              <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
            </Card>
          )}
          {data?.map((s) => (
            <Card key={s.id} className="group flex flex-col p-6 transition-shadow hover:shadow-lift">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-ink">{s.name}</h3>
                <Sparkles className="size-5 shrink-0 text-brand-400" aria-hidden />
              </div>
              <p className="mt-2 flex-1 text-sm text-slate-600">{s.description}</p>
              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                  <Timer className="size-4" aria-hidden />
                  {formatDuration(s.durationMin)}
                </span>
                <span className="font-bold text-brand-800">{formatEgp(s.priceEgp)}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function Dentists() {
  const { data, isPending, isError, error, refetch } = useDoctors();
  return (
    <section id="dentists" className="scroll-mt-20 bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Our team"
          title="Meet your dentists"
          text="A small team, so you see the same familiar face at every visit."
        />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {isPending &&
            Array.from({ length: 3 }, (_, i) => (
              <div key={i}>
                <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
                <Skeleton className="mt-4 h-5 w-1/2" />
                <Skeleton className="mt-2 h-4 w-1/3" />
              </div>
            ))}
          {isError && (
            <div className="md:col-span-3">
              <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
            </div>
          )}
          {data?.map((d) => (
            <article key={d.id}>
              <img
                src={d.photoUrl}
                alt={`Portrait of ${d.name}`}
                loading="lazy"
                className="aspect-[4/3] w-full rounded-2xl bg-brand-50 object-cover object-top"
              />
              <h3 className="mt-4 text-lg font-bold text-ink">{d.name}</h3>
              <p className="text-sm font-semibold text-brand-700">{d.specialty}</p>
              <p className="mt-2 text-sm text-slate-600">{d.bio}</p>
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <CalendarClock className="size-3.5" aria-hidden />
                {workingDaysSummary(d.workingHours.map((h) => h.weekday))}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { icon: Stethoscope, title: 'Pick a treatment', text: 'Checkups, cleaning, whitening, fillings or a braces consult.' },
    { icon: CalendarClock, title: 'Choose a time', text: 'Live availability, calculated from each dentist’s real schedule.' },
    { icon: CalendarCheck, title: 'You’re booked', text: 'Get a reference code instantly. Cancel online any time.' },
  ];
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-3xl bg-brand-800 px-6 py-10 text-white sm:px-10 sm:py-14">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">Booking takes about two minutes</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-brand-100">
                  <s.icon className="size-5" aria-hidden />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-200">Step {i + 1}</p>
                  <h3 className="mt-0.5 font-bold">{s.title}</h3>
                  <p className="mt-1 text-sm text-brand-100/90">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <ButtonLink to="/book" size="lg" variant="secondary" className="mt-10">
            Start booking
            <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
