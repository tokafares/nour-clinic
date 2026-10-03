import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { EyeOff, Pencil, Plus, Stethoscope, Timer, Trash2 } from 'lucide-react';
import { serviceInputSchema } from '@shared/schemas';
import type { ServiceDto } from '@shared/types';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatDuration, formatEgp } from '../../lib/format';
import { errorMessage, keys } from '../../lib/queries';
import { PageHeader } from '../../components/AdminLayout';
import { Button } from '../../components/ui/Button';
import { Card, EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input, Textarea } from '../../components/ui/Field';

interface FormState {
  name: string;
  description: string;
  durationMin: string;
  priceEgp: string;
  active: boolean;
}

const emptyForm: FormState = { name: '', description: '', durationMin: '30', priceEgp: '', active: true };
type Errors = Partial<Record<keyof FormState, string>>;

export function ServicesPage() {
  const queryClient = useQueryClient();
  const services = useQuery({ queryKey: ['admin', 'services'], queryFn: api.admin.services });
  const [editing, setEditing] = useState<ServiceDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ServiceDto | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Errors>({});

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'services'] });
    void queryClient.invalidateQueries({ queryKey: keys.services });
  };

  const openEditor = (service: ServiceDto | 'new') => {
    setErrors({});
    setForm(
      service === 'new'
        ? emptyForm
        : {
            name: service.name,
            description: service.description,
            durationMin: String(service.durationMin),
            priceEgp: String(service.priceEgp),
            active: service.active,
          },
    );
    setEditing(service);
  };

  const save = useMutation({
    mutationFn: (input: ReturnType<typeof serviceInputSchema.parse>) =>
      editing === 'new' || editing === null ? api.admin.createService(input) : api.admin.updateService(editing.id, input),
    onSuccess: (s) => {
      toast.success(editing === 'new' ? `Added ${s.name}` : `Saved ${s.name}`);
      setEditing(null);
      refresh();
    },
    onError: (err) => toast.error('Could not save', { description: err.message }),
  });

  const toggle = useMutation({
    mutationFn: (s: ServiceDto) =>
      api.admin.updateService(s.id, {
        name: s.name,
        description: s.description,
        durationMin: s.durationMin,
        priceEgp: s.priceEgp,
        active: !s.active,
      }),
    onSuccess: (s) => {
      toast.success(s.active ? `${s.name} is bookable again` : `${s.name} is hidden from booking`);
      refresh();
    },
    onError: (err) => toast.error('Could not update', { description: err.message }),
  });

  const remove = useMutation({
    mutationFn: (s: ServiceDto) => api.admin.deleteService(s.id),
    onSuccess: () => {
      toast.success('Service deleted');
      setDeleting(null);
      refresh();
    },
    onError: (err) => {
      setDeleting(null);
      toast.error('Could not delete', { description: err.message });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = serviceInputSchema.safeParse({
      name: form.name,
      description: form.description,
      durationMin: form.durationMin === '' ? undefined : Number(form.durationMin),
      priceEgp: form.priceEgp === '' ? undefined : Number(form.priceEgp),
      active: form.active,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0] as keyof FormState | undefined;
        if (k && !next[k]) next[k] = i.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  };

  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Services"
        description="What patients can book, how long it takes and what it costs."
        actions={
          <Button onClick={() => openEditor('new')} icon={<Plus className="size-4" aria-hidden />}>
            Add service
          </Button>
        }
      />

      <Card className="overflow-hidden">
        {services.isPending ? (
          <ul className="divide-y divide-slate-100">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="flex items-center gap-4 px-4 py-4 sm:px-5">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3.5 w-72 max-w-full" />
                </div>
                <Skeleton className="h-9 w-24" />
              </li>
            ))}
          </ul>
        ) : services.isError ? (
          <ErrorState message={errorMessage(services.error)} onRetry={() => void services.refetch()} />
        ) : services.data.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No services yet"
            description="Add your first treatment so patients can book it."
            action={<Button onClick={() => openEditor('new')}>Add service</Button>}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {services.data.map((s) => (
              <li key={s.id} className={cn('flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5', !s.active && 'bg-slate-50/70')}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn('font-bold', s.active ? 'text-ink' : 'text-slate-500')}>{s.name}</p>
                    {!s.active && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        <EyeOff className="size-3" aria-hidden />
                        Hidden
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{s.description}</p>
                  <p className="mt-1.5 flex items-center gap-3 text-sm">
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <Timer className="size-3.5" aria-hidden />
                      {formatDuration(s.durationMin)}
                    </span>
                    <span className="font-bold text-brand-800">{formatEgp(s.priceEgp)}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => toggle.mutate(s)} loading={toggle.isPending && toggle.variables.id === s.id}>
                    {s.active ? 'Hide' : 'Show'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEditor(s)} icon={<Pencil className="size-3.5" aria-hidden />}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(s)} aria-label={`Delete ${s.name}`} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add a service' : 'Edit service'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="service-form" loading={save.isPending}>
              {editing === 'new' ? 'Add service' : 'Save changes'}
            </Button>
          </>
        }
      >
        <form id="service-form" noValidate onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name} className="sm:col-span-2">
            {(p) => <Input {...p} invalid={p['aria-invalid']} value={form.name} onChange={set('name')} />}
          </Field>
          <Field label="Description" error={errors.description} optional className="sm:col-span-2">
            {(p) => <Textarea {...p} invalid={p['aria-invalid']} rows={3} value={form.description} onChange={set('description')} maxLength={300} />}
          </Field>
          <Field label="Duration (minutes)" error={errors.durationMin} hint="Multiples of 15">
            {(p) => <Input {...p} invalid={p['aria-invalid']} type="number" inputMode="numeric" min={15} step={15} value={form.durationMin} onChange={set('durationMin')} />}
          </Field>
          <Field label="Price (EGP)" error={errors.priceEgp}>
            {(p) => <Input {...p} invalid={p['aria-invalid']} type="number" inputMode="numeric" min={0} step={50} value={form.priceEgp} onChange={set('priceEgp')} />}
          </Field>
          <label className="flex items-center gap-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              className="size-4 rounded accent-brand-700"
            />
            <span className="text-sm font-semibold text-ink">Patients can book this service online</span>
          </label>
        </form>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'service'}?`}
        description="Services with appointment history can’t be deleted. Hide them instead."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">This removes the service permanently.</p>
      </Dialog>
    </>
  );
}
