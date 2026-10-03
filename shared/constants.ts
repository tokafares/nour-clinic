/** Clinic-wide scheduling rules shared by the client and the server. */
export const CLINIC_TIMEZONE = 'Africa/Cairo';
export const BOOKING_WINDOW_DAYS = 21;
export const MIN_NOTICE_MINUTES = 120;
export const SLOT_STEP_MINUTES = 30;

export const APPOINTMENT_STATUSES = ['confirmed', 'completed', 'cancelled', 'no_show'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
