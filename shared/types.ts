import type { AppointmentStatus } from './constants.js';

/** Every error response from the API has this shape. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
  };
}

export interface ServiceDto {
  id: number;
  slug: string;
  name: string;
  description: string;
  durationMin: number;
  priceEgp: number;
  active: boolean;
}

export interface WorkingHoursDto {
  weekday: number;
  startMin: number;
  endMin: number;
}

export interface DoctorDto {
  id: number;
  name: string;
  title: string;
  specialty: string;
  bio: string;
  photoUrl: string;
  workingHours: WorkingHoursDto[];
}

export interface AvailabilityDayDto {
  date: string;
  weekday: number;
  /** Number of start times still bookable that day (0 = fully booked or closed). */
  availableSlots: number;
  open: boolean;
}

export interface SlotDto {
  startsAt: string;
  endsAt: string;
  label: string;
  doctorIds: number[];
}

export interface BookingDto {
  reference: string;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  notes: string;
  priceEgp: number;
  service: { id: number; name: string; durationMin: number };
  doctor: { id: number; name: string; title: string; photoUrl: string };
  canCancel: boolean;
}

export interface AdminAppointmentDto extends BookingDto {
  id: string;
  createdAt: string;
}

export interface PaginatedDto<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminDto {
  id: number;
  email: string;
  name: string;
}

export interface StatsDto {
  today: number;
  todayCompleted: number;
  thisWeek: number;
  upcoming: number;
  cancellationRate: number;
  cancellationWindowDays: number;
}
