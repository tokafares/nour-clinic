import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../server/app.js';
import { getDb } from '../server/db/client.js';
import { requireEnv } from '../server/env.js';

// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json)
// and handed to the Fastify instance, which is reused across warm invocations.
let appPromise: Promise<FastifyInstance> | undefined;

function getApp(): Promise<FastifyInstance> {
  appPromise ??= buildApp({
    db: getDb(),
    jwtSecret: requireEnv('JWT_SECRET'),
    secureCookies: true,
    cronSecret: process.env.CRON_SECRET,
    logger: true,
  }).then(async (app) => {
    await app.ready();
    return app;
  });
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getApp();
  app.server.emit('request', req, res);
}
