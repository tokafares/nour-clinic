import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarRange, ExternalLink, LayoutDashboard, LogOut, Stethoscope, UsersRound } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { keys, useAdminSession } from '../lib/queries';
import { Skeleton } from './ui/Feedback';
import { Logo } from './Logo';

const nav = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/appointments', label: 'Appointments', icon: CalendarRange, end: false },
  { to: '/admin/services', label: 'Services', icon: Stethoscope, end: false },
  { to: '/admin/dentists', label: 'Dentists & hours', icon: UsersRound, end: false },
];

export function AdminLayout() {
  const session = useAdminSession();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (session.isPending) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!session.data) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />;
  }

  const logout = async () => {
    try {
      await api.admin.logout();
    } finally {
      queryClient.setQueryData(keys.me, null);
      queryClient.removeQueries({ queryKey: keys.admin, predicate: (q) => q.queryKey[1] !== 'me' });
      toast.success('Signed out');
      navigate('/admin/login', { replace: true });
    }
  };

  return (
    <div className="min-h-dvh bg-mist lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 z-30 border-b border-slate-200 bg-white lg:h-dvh lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center justify-between gap-2 px-4 lg:px-5">
          <Logo to="/admin" subtitle="Clinic admin" />
          <button
            type="button"
            onClick={() => void logout()}
            className="grid size-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-ink lg:hidden"
            aria-label="Sign out"
          >
            <LogOut className="size-5" aria-hidden />
          </button>
        </div>
        <nav
          aria-label="Admin"
          className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0 lg:pt-2"
        >
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors lg:py-2.5',
                  isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-ink',
                )
              }
            >
              <n.icon className="size-4" aria-hidden />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute inset-x-0 bottom-0 hidden border-t border-slate-100 p-4 lg:block">
          <p className="truncate text-sm font-bold text-ink">{session.data.name}</p>
          <p className="truncate text-xs text-slate-500">{session.data.email}</p>
          <div className="mt-3 flex gap-2">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              Site
            </a>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <LogOut className="size-3.5" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
