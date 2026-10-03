import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Clock, MapPin, Menu, Phone, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { ButtonLink } from './ui/Button';
import { Logo } from './Logo';

const links = [
  { to: '/#services', label: 'Services' },
  { to: '/#dentists', label: 'Dentists' },
  { to: '/manage', label: 'Manage booking' },
];

export function SiteLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({ top: 0 });
      return;
    }
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [location.pathname, location.hash]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-800"
              >
                {l.label}
              </NavLink>
            ))}
            <ButtonLink to="/book" size="sm" className="ml-2">
              Book appointment
            </ButtonLink>
          </nav>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-xl text-ink hover:bg-slate-100 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className={cn('border-t border-slate-100 bg-white px-4 pb-4 pt-2 md:hidden', open ? 'block' : 'hidden')}
        >
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="block rounded-lg px-3 py-3 text-[15px] font-semibold text-slate-700 hover:bg-brand-50"
            >
              {l.label}
            </Link>
          ))}
          <ButtonLink to="/book" className="mt-2 w-full">
            Book appointment
          </ButtonLink>
        </nav>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-slate-500">
              Gentle, modern dentistry in the heart of Heliopolis. Book online in under two minutes.
            </p>
          </div>
          <ul className="space-y-2.5 text-sm text-slate-600">
            <li className="flex gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              14 El-Merghany St, Heliopolis, Cairo
            </li>
            <li className="flex gap-2.5">
              <Phone className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              +20 2 2000 0000
            </li>
            <li className="flex gap-2.5">
              <Clock className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              Sat – Thu · 09:00 – 20:00
            </li>
          </ul>
          <div className="text-sm text-slate-500">
            <p className="font-semibold text-ink">Concept project</p>
            <p className="mt-1">
              Nour Dental Clinic is fictional. Bookings made here are demo data and no one will call you.
            </p>
            <Link to="/admin" className="mt-3 inline-block font-semibold text-brand-700 hover:underline">
              Staff sign-in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
