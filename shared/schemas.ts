import { z } from 'zod';
import { APPOINTMENT_STATUSES } from './constants.js';
import { isValidDateString } from './time.js';

export const PHONE_HINT = 'Enter 8–15 digits, optionally starting with +';

/** Strips spaces, dashes, dots and parentheses so phones compare reliably. */
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, '');
}

export const phoneSchema = z
  .string()
  .trim()
  .transform(normalizePhone)
  .pipe(z.string().regex(/^\+?\d{8,15}$/, PHONE_HINT));

export const dateStringSchema = z.string().refine(isValidDateString, 'Use the YYYY-MM-DD format');

export const referenceSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^NDC-[A-Z0-9]{6}$/, 'References look like NDC-AB12CD');

export const doctorChoiceSchema = z.union([z.literal('any'), z.coerce.number().int().positive()]);

export const patientDetailsSchema = z.object({
  patientName: z.string().trim().min(2, 'Please enter your full name').max(120, 'Name is too long'),
  patientPhone: phoneSchema,
  patientEmail: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  notes: z.string().trim().max(500, 'Keep notes under 500 characters').optional().default(''),
});
export type PatientDetailsInput = z.input<typeof patientDetailsSchema>;

export const createBookingSchema = patientDetailsSchema.extend({
  serviceId: z.number().int().positive(),
  doctorId: doctorChoiceSchema,
  startsAt: z.iso.datetime({ offset: true }),
});
export type CreateBookingInput = z.input<typeof createBookingSchema>;

export const lookupBookingSchema = z.object({
  reference: referenceSchema,
  phone: phoneSchema,
});
export type LookupBookingInput = z.input<typeof lookupBookingSchema>;

export const availabilityQuerySchema = z.object({
  serviceId: z.coerce.number().int().positive(),
  doctorId: doctorChoiceSchema.default('any'),
});

export const slotsQuerySchema = availabilityQuerySchema.extend({ date: dateStringSchema });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginInput = z.input<typeof loginSchema>;

export const statusSchema = z.enum(APPOINTMENT_STATUSES);

export const updateStatusSchema = z.object({ status: statusSchema });

export const appointmentFiltersSchema = z.object({
  date: dateStringSchema.optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  doctorId: z.coerce.number().int().positive().optional(),
  status: statusSchema.optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type AppointmentFilters = z.input<typeof appointmentFiltersSchema>;

export const serviceInputSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  description: z.string().trim().max(300).default(''),
  durationMin: z
    .number({ error: 'Duration is required' })
    .int()
    .min(15, 'At least 15 minutes')
    .max(240, 'At most 4 hours')
    .refine((v) => v % 15 === 0, 'Use multiples of 15 minutes'),
  priceEgp: z.number({ error: 'Price is required' }).int().min(0).max(1_000_000),
  active: z.boolean().default(true),
});
export type ServiceInput = z.input<typeof serviceInputSchema>;

const minutesSchema = z.number().int().min(0).max(24 * 60);

export const workingHoursSchema = z
  .array(
    z
      .object({
        weekday: z.number().int().min(0).max(6),
        startMin: minutesSchema,
        endMin: minutesSchema,
      })
      .refine((h) => h.endMin - h.startMin >= 30, { message: 'Shift must be at least 30 minutes', path: ['endMin'] }),
  )
  .max(7)
  .refine((rows) => new Set(rows.map((r) => r.weekday)).size === rows.length, 'Each weekday can appear only once');
export type WorkingHoursInput = z.input<typeof workingHoursSchema>;
