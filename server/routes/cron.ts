import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { resetDemoData } from '../db/seed.js';
import { AppError } from '../errors.js';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Compared in constant time. */
function isAuthorized(request: FastifyRequest, secret: string): boolean {
  const header = request.headers.authorization ?? '';
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

export const cronRoutes: FastifyPluginAsync<{ cronSecret: string | undefined }> = async (app, opts) => {
  app.get('/reset-demo', async (request) => {
    // Fail closed: without a configured secret nobody can trigger a reset.
    if (!opts.cronSecret) throw new AppError(503, 'CRON_NOT_CONFIGURED', 'CRON_SECRET is not configured.');
    if (!isAuthorized(request, opts.cronSecret)) throw new AppError(401, 'UNAUTHORIZED', 'Missing or invalid cron secret.');

    const startedAt = Date.now();
    const result = await resetDemoData(app.db, app.now());
    request.log.info({ ...result, ms: Date.now() - startedAt }, 'demo data reset');
    return { ok: true, appointments: result.appointments, durationMs: Date.now() - startedAt };
  });
};
