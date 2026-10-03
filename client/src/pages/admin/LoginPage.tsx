import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, LockKeyhole } from 'lucide-react';
import { loginSchema } from '@shared/schemas';
import { api } from '../../lib/api';
import { keys, useAdminSession } from '../../lib/queries';
import { Logo } from '../../components/Logo';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Feedback';
import { Field, Input } from '../../components/ui/Field';

export const DEMO_EMAIL = 'admin@nourdental.demo';
export const DEMO_PASSWORD = 'NourDemo2026';

export function LoginPage() {
  const session = useAdminSession();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const from =
    typeof location.state === 'object' && location.state && 'from' in location.state && typeof location.state.from === 'string'
      ? location.state.from
      : '/admin';

  const login = useMutation({
    mutationFn: api.admin.login,
    onSuccess: (admin) => {
      queryClient.setQueryData(keys.me, admin);
      toast.success(`Welcome back, ${admin.name}`);
      navigate(from, { replace: true });
    },
    onError: (err) => setErrors({ form: err.message }),
  });

  if (session.data) return <Navigate to="/admin" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0];
        if ((k === 'email' || k === 'password') && !next[k]) next[k] = i.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    login.mutate(parsed.data);
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-gradient-to-b from-brand-50 to-mist px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo subtitle="Clinic admin" />
        </div>
        <Card className="p-6">
          <h1 className="text-xl font-bold text-ink">Staff sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Manage appointments, services and opening hours.</p>
          <form noValidate onSubmit={submit} className="mt-6 space-y-4">
            {errors.form && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700">
                {errors.form}
              </p>
            )}
            <Field label="Email" error={errors.email}>
              {(p) => (
                <Input {...p} invalid={p['aria-invalid']} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
              )}
            </Field>
            <Field label="Password" error={errors.password}>
              {(p) => (
                <Input {...p} invalid={p['aria-invalid']} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              )}
            </Field>
            <Button type="submit" className="w-full" loading={login.isPending} icon={<LockKeyhole className="size-4" aria-hidden />}>
              Sign in
            </Button>
          </form>
        </Card>
        <div className="mt-4 rounded-2xl border border-brand-200 bg-white/70 p-4 text-sm">
          <p className="flex items-center gap-2 font-bold text-brand-800">
            <KeyRound className="size-4" aria-hidden />
            Demo credentials (concept project)
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-slate-600">
            <dt>Email</dt>
            <dd className="font-mono text-ink">{DEMO_EMAIL}</dd>
            <dt>Password</dt>
            <dd className="font-mono text-ink">{DEMO_PASSWORD}</dd>
          </dl>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3 w-full"
            onClick={() => {
              setEmail(DEMO_EMAIL);
              setPassword(DEMO_PASSWORD);
              setErrors({});
            }}
          >
            Fill in demo credentials
          </Button>
        </div>
      </div>
    </div>
  );
}
