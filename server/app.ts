import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '../shared/types.js';
import type { Db } from './db/types.js';
import { AppError } from './errors.js';
import { zodToAppError } from './validation.js';
import { authPlugin } from './plugins/auth.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    /** Injectable clock so tests can control "now". */
    now: () => Date;
  }
}

export interface BuildAppOptions {
  db: Db;
  jwtSecret: string;
  now?: () => Date;
  logger?: boolean;
  /** Disable rate limiting (tests). */
  rateLimit?: boolean;
  secureCookies?: boolean;
}

const errorBody = (code: string, message: string, details?: ApiErrorBody['error']['details']): ApiErrorBody => ({
  error: details ? { code, message, details } : { code, message },
});

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: true,
    bodyLimit: 32 * 1024,
  });

  app.decorate('db', opts.db);
  app.decorate('now', opts.now ?? (() => new Date()));

  await app.register(cookie);
  await app.register(jwt, {
    secret: opts.jwtSecret,
    cookie: { cookieName: 'nour_admin', signed: false },
    sign: { expiresIn: '8h' },
  });
  await app.register(rateLimit, {
    global: false,
    enableDraftSpec: true,
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: `Too many requests. Please try again in ${ctx.after}.`,
    }),
  });

  app.setErrorHandler((err: FastifyError | AppError | ZodError, request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(errorBody(err.code, err.message, err.details));
    }
    if (err instanceof ZodError) {
      const appErr = zodToAppError(err);
      return reply.status(400).send(errorBody(appErr.code, appErr.message, appErr.details));
    }
    const status = err.statusCode ?? 500;
    if (status === 429) {
      return reply.status(429).send(errorBody('RATE_LIMITED', err.message));
    }
    if (status >= 400 && status < 500) {
      // Fastify's own client errors: malformed JSON, body too large, wrong content type…
      return reply.status(status).send(errorBody(err.code ?? 'BAD_REQUEST', err.message));
    }
    request.log.error(err);
    return reply.status(500).send(errorBody('INTERNAL_ERROR', 'Something went wrong on our side. Please try again.'));
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(errorBody('NOT_FOUND', `Route ${request.method} ${request.url.split('?')[0]} not found`));
  });

  await app.register(authPlugin, { secureCookies: opts.secureCookies ?? false });
  await app.register(
    async (api) => {
      api.get('/health', async () => ({ ok: true, time: app.now().toISOString() }));
      await api.register(publicRoutes, { rateLimit: opts.rateLimit ?? true });
      await api.register(adminRoutes, { prefix: '/admin', rateLimit: opts.rateLimit ?? true });
    },
    { prefix: '/api' },
  );

  return app;
}
