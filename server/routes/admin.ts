import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  appointmentFiltersSchema,
  loginSchema,
  serviceInputSchema,
  updateStatusSchema,
  workingHoursSchema,
} from '../../shared/schemas.js';
import type { AdminDto } from '../../shared/types.js';
import { parse } from '../validation.js';
import { admins } from '../db/schema.js';
import { AppError } from '../errors.js';
import {
  createService,
  deleteService,
  getStats,
  listAllDoctors,
  listAppointments,
  replaceWorkingHours,
  updateAppointmentStatus,
  updateService,
} from '../services/admin.js';
import { listServices } from '../services/catalog.js';

// Compared against when the email is unknown so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const idParam = z.object({ id: z.coerce.number().int().positive() });
const uuidParam = z.object({ id: z.uuid('Invalid appointment id') });

export const adminRoutes: FastifyPluginAsync<{ rateLimit: boolean }> = async (app, opts) => {
  app.post(
    '/login',
    opts.rateLimit ? { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } } : {},
    async (request, reply) => {
      const { email, password } = parse(loginSchema, request.body);
      const [admin] = await app.db.select().from(admins).where(eq(admins.email, email));
      const ok = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
      if (!admin || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
      const dto: AdminDto = { id: admin.id, email: admin.email, name: admin.name };
      await app.setSessionCookie(reply, dto);
      return { admin: dto };
    },
  );

  app.post('/logout', async (_request, reply) => {
    app.clearSessionCookie(reply);
    return { ok: true };
  });

  // Everything registered below requires a valid session.
  await app.register(async (secured) => {
    secured.addHook('onRequest', async (request) => app.requireAdmin(request));

    secured.get('/me', async (request) => {
      const admin: AdminDto = { id: Number(request.user.sub), email: request.user.email, name: request.user.name };
      return { admin };
    });

    secured.get('/stats', async () => ({ stats: await getStats(app.db, app.now()) }));

    secured.get('/appointments', async (request) => {
      const filters = parse(appointmentFiltersSchema, request.query);
      return listAppointments(app.db, filters, app.now());
    });

    secured.patch('/appointments/:id', async (request) => {
      const { id } = parse(uuidParam, request.params);
      const { status } = parse(updateStatusSchema, request.body);
      return { appointment: await updateAppointmentStatus(app.db, id, status, app.now()) };
    });

    secured.get('/services', async () => ({ services: await listServices(app.db, { includeInactive: true }) }));

    secured.post('/services', async (request, reply) => {
      const data = parse(serviceInputSchema, request.body);
      return reply.status(201).send({ service: await createService(app.db, data) });
    });

    secured.put('/services/:id', async (request) => {
      const { id } = parse(idParam, request.params);
      const data = parse(serviceInputSchema, request.body);
      return { service: await updateService(app.db, id, data) };
    });

    secured.delete('/services/:id', async (request, reply) => {
      const { id } = parse(idParam, request.params);
      await deleteService(app.db, id);
      return reply.status(204).send();
    });

    secured.get('/doctors', async () => ({ doctors: await listAllDoctors(app.db) }));

    secured.put('/doctors/:id/hours', async (request) => {
      const { id } = parse(idParam, request.params);
      const hours = parse(z.object({ hours: workingHoursSchema }), request.body).hours;
      return { doctor: await replaceWorkingHours(app.db, id, hours) };
    });
  });
};
