import type {
  AdminAppointmentDto,
  AdminDto,
  ApiErrorBody,
  AvailabilityDayDto,
  BookingDto,
  DoctorDto,
  PaginatedDto,
  ServiceDto,
  SlotDto,
  StatsDto,
  WorkingHoursDto,
} from '@shared/types';
import type { AppointmentStatus } from '@shared/constants';
import type { CreateBookingInput, LoginInput, ServiceInput } from '@shared/schemas';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof value.error === 'object' &&
    value.error !== null &&
    'message' in value.error
  );
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (isApiErrorBody(data)) {
      throw new ApiError(res.status, data.error.code, data.error.message, data.error.details);
    }
    throw new ApiError(res.status, 'UNKNOWN', 'Something went wrong. Please try again.');
  }
  return data as T;
}

const qs = (params: Record<string, string | number | undefined>): string => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
};

export type DoctorChoice = number | 'any';

export interface AppointmentQuery {
  date?: string;
  from?: string;
  to?: string;
  doctorId?: number;
  status?: AppointmentStatus;
  q?: string;
  page?: number;
  pageSize?: number;
}

export const api = {
  services: () => request<{ services: ServiceDto[] }>('GET', '/services').then((r) => r.services),
  doctors: () => request<{ doctors: DoctorDto[] }>('GET', '/doctors').then((r) => r.doctors),
  availabilityDays: (serviceId: number, doctorId: DoctorChoice) =>
    request<{ days: AvailabilityDayDto[] }>('GET', `/availability/days${qs({ serviceId, doctorId })}`).then(
      (r) => r.days,
    ),
  slots: (serviceId: number, doctorId: DoctorChoice, date: string) =>
    request<{ slots: SlotDto[] }>('GET', `/availability/slots${qs({ serviceId, doctorId, date })}`).then(
      (r) => r.slots,
    ),
  createBooking: (input: CreateBookingInput) =>
    request<{ booking: BookingDto }>('POST', '/bookings', input).then((r) => r.booking),
  lookupBooking: (reference: string, phone: string) =>
    request<{ booking: BookingDto }>('POST', '/bookings/lookup', { reference, phone }).then((r) => r.booking),
  cancelBooking: (reference: string, phone: string) =>
    request<{ booking: BookingDto }>('POST', `/bookings/${encodeURIComponent(reference)}/cancel`, { phone }).then(
      (r) => r.booking,
    ),

  admin: {
    login: (input: LoginInput) => request<{ admin: AdminDto }>('POST', '/admin/login', input).then((r) => r.admin),
    logout: () => request<{ ok: true }>('POST', '/admin/logout'),
    me: () => request<{ admin: AdminDto }>('GET', '/admin/me').then((r) => r.admin),
    stats: () => request<{ stats: StatsDto }>('GET', '/admin/stats').then((r) => r.stats),
    appointments: (query: AppointmentQuery) =>
      request<PaginatedDto<AdminAppointmentDto>>('GET', `/admin/appointments${qs({ ...query })}`),
    setStatus: (id: string, status: AppointmentStatus) =>
      request<{ appointment: AdminAppointmentDto }>('PATCH', `/admin/appointments/${id}`, { status }).then(
        (r) => r.appointment,
      ),
    services: () => request<{ services: ServiceDto[] }>('GET', '/admin/services').then((r) => r.services),
    createService: (input: ServiceInput) =>
      request<{ service: ServiceDto }>('POST', '/admin/services', input).then((r) => r.service),
    updateService: (id: number, input: ServiceInput) =>
      request<{ service: ServiceDto }>('PUT', `/admin/services/${id}`, input).then((r) => r.service),
    deleteService: (id: number) => request<undefined>('DELETE', `/admin/services/${id}`),
    doctors: () => request<{ doctors: DoctorDto[] }>('GET', '/admin/doctors').then((r) => r.doctors),
    saveHours: (id: number, hours: WorkingHoursDto[]) =>
      request<{ doctor: DoctorDto }>('PUT', `/admin/doctors/${id}/hours`, { hours }).then((r) => r.doctor),
  },
};
