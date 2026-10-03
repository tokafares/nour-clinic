import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  availabilityQuerySchema,
  createBookingSchema,
  lookupBookingSchema,
  phoneSchema,
  referenceSchema,
  slotsQuerySchema,
} from '../../shared/schemas.js';
import { parse } from '../validation.js';
import { availabilityDays, slotsForDate, toSlotDto } from '../services/availability.js';
import { cancelBookingByPatient, createBooking, lookupBooking } from '../services/bookings.js';
import { listDoctors, listServices } from '../services/catalog.js';

const limit = (enabled: boolean, max: number, timeWindow: string) =>
  enabled ? { config: { rateLimit: { max, timeWindow } } } : {};

export const publicRoutes: FastifyPluginAsync<{ rateLimit: boolean }> = async (app, opts) => {
  const rl = opts.rateLimit;

  app.get('/services', async () => ({ services: await listServices(app.db) }));

  app.get('/doctors', async () => ({ doctors: await listDoctors(app.db) }));

  app.get('/availability/days', limit(rl, 120, '1 minute'), async (request) => {
    const q = parse(availabilityQuerySchema, request.query);
    return { days: await availabilityDays(app.db, { ...q, now: app.now() }) };
  });

  app.get('/availability/slots', limit(rl, 120, '1 minute'), async (request) => {
    const q = parse(slotsQuerySchema, request.query);
    const slots = await slotsForDate(app.db, { ...q, now: app.now() });
    return { date: q.date, slots: slots.map(toSlotDto) };
  });

  app.post('/bookings', limit(rl, 10, '10 minutes'), async (request, reply) => {
    const input = parse(createBookingSchema, request.body);
    const booking = await createBooking(app.db, input, app.now());
    return reply.status(201).send({ booking });
  });

  app.post('/bookings/lookup', limit(rl, 20, '10 minutes'), async (request) => {
    const { reference, phone } = parse(lookupBookingSchema, request.body);
    return { booking: await lookupBooking(app.db, reference, phone, app.now()) };
  });

  app.post('/bookings/:reference/cancel', limit(rl, 20, '10 minutes'), async (request) => {
    const { reference } = parse(z.object({ reference: referenceSchema }), request.params);
    const { phone } = parse(z.object({ phone: phoneSchema }), request.body);
    return { booking: await cancelBookingByPatient(app.db, reference, phone, app.now()) };
  });
};
