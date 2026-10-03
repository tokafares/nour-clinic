import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AdminDto } from '../../shared/types.js';
import { unauthorized } from '../errors.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string; name: string };
    user: { sub: string; email: string; name: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAdmin: (request: FastifyRequest) => Promise<void>;
    setSessionCookie: (reply: FastifyReply, admin: AdminDto) => Promise<void>;
    clearSessionCookie: (reply: FastifyReply) => void;
  }
}

export const SESSION_COOKIE = 'nour_admin';
const SESSION_SECONDS = 8 * 60 * 60;

export const authPlugin = fp<{ secureCookies: boolean }>(async (app, opts) => {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    secure: opts.secureCookies,
    sameSite: 'lax' as const,
  };

  app.decorate('requireAdmin', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw unauthorized('Your session has expired. Please sign in again.');
    }
  });

  app.decorate('setSessionCookie', async (reply: FastifyReply, admin: AdminDto) => {
    const token = await reply.jwtSign({ sub: String(admin.id), email: admin.email, name: admin.name });
    reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_SECONDS });
  });

  app.decorate('clearSessionCookie', (reply: FastifyReply) => {
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
  });
});
