import { Link } from 'react-router';
import { cn } from '../lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-9', className)}>
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <path
        d="M10.5 8.5c-2.6 0-4 2.2-3.5 5 .4 2.3 1.4 3.9 1.9 6.4.5 2.7 1 4.6 2.4 4.6 1.6 0 1.6-2.4 2.2-4.3.4-1.2 1-1.8 2.5-1.8s2.1.6 2.5 1.8c.6 1.9.6 4.3 2.2 4.3 1.4 0 1.9-1.9 2.4-4.6.5-2.5 1.5-4.1 1.9-6.4.5-2.8-.9-5-3.5-5-2 0-3.2 1-5.5 1s-3.5-1-5.5-1z"
        fill="#fff"
      />
    </svg>
  );
}

export function Logo({ to = '/', subtitle = 'Dental Clinic' }: { to?: string; subtitle?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 text-brand-700" aria-label="Nour Dental Clinic home">
      <LogoMark />
      <span className="leading-none">
        <span className="block font-display text-xl font-semibold text-ink">Nour</span>
        <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{subtitle}</span>
      </span>
    </Link>
  );
}
