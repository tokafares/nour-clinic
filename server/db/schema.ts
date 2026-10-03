import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { APPOINTMENT_STATUSES } from '../../shared/constants.js';

export const appointmentStatus = pgEnum('appointment_status', APPOINTMENT_STATUSES);

export const admins = pgTable('admins', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const services = pgTable(
  'services',
  {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 80 }).notNull().unique(),
    name: varchar('name', { length: 80 }).notNull(),
    description: text('description').notNull().default(''),
    durationMin: integer('duration_min').notNull(),
    priceEgp: integer('price_egp').notNull(),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('services_duration_positive', sql`${t.durationMin} > 0`),
    check('services_price_non_negative', sql`${t.priceEgp} >= 0`),
  ],
);

export const doctors = pgTable('doctors', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  title: varchar('title', { length: 120 }).notNull(),
  specialty: varchar('specialty', { length: 120 }).notNull(),
  bio: text('bio').notNull().default(''),
  photoUrl: text('photo_url').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workingHours = pgTable(
  'working_hours',
  {
    id: serial('id').primaryKey(),
    doctorId: integer('doctor_id')
      .notNull()
      .references(() => doctors.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    startMin: integer('start_min').notNull(),
    endMin: integer('end_min').notNull(),
  },
  (t) => [
    uniqueIndex('working_hours_doctor_weekday_uq').on(t.doctorId, t.weekday),
    check('working_hours_weekday_range', sql`${t.weekday} between 0 and 6`),
    check('working_hours_valid_shift', sql`${t.startMin} >= 0 and ${t.endMin} <= 1440 and ${t.endMin} > ${t.startMin}`),
  ],
);

/**
 * Double booking is prevented by an exclusion constraint added in a custom
 * migration (see drizzle/0001_*.sql): no two non-cancelled appointments for the
 * same doctor may have overlapping [starts_at, ends_at) ranges.
 */
export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: varchar('reference', { length: 16 }).notNull().unique(),
    serviceId: integer('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    doctorId: integer('doctor_id')
      .notNull()
      .references(() => doctors.id, { onDelete: 'restrict' }),
    patientName: varchar('patient_name', { length: 120 }).notNull(),
    patientPhone: varchar('patient_phone', { length: 20 }).notNull(),
    patientEmail: varchar('patient_email', { length: 255 }).notNull(),
    notes: text('notes').notNull().default(''),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    priceEgp: integer('price_egp').notNull(),
    status: appointmentStatus('status').notNull().default('confirmed'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('appointments_starts_at_idx').on(t.startsAt),
    index('appointments_doctor_starts_idx').on(t.doctorId, t.startsAt),
    check('appointments_valid_range', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

export type AppointmentRow = typeof appointments.$inferSelect;
export type ServiceRow = typeof services.$inferSelect;
export type DoctorRow = typeof doctors.$inferSelect;
export type WorkingHoursRow = typeof workingHours.$inferSelect;
