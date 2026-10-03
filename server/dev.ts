import { buildApp } from './app.js';
import { getDb } from './db/client.js';
import { requireEnv } from './env.js';

const app = await buildApp({
  db: getDb(),
  jwtSecret: requireEnv('JWT_SECRET'),
  logger: true,
});

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '127.0.0.1' });
