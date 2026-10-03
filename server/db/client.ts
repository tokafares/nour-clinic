import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import type { Db } from './types.js';

let cached: { db: Db; pool: pg.Pool } | undefined;

/** Lazily creates one small pool per process (serverless instances are reused). */
export function getDb(): Db {
  if (cached) return cached.db;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const pool = new pg.Pool({
    connectionString,
    max: process.env.VERCEL ? 3 : 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  cached = { pool, db: drizzle(pool, { schema }) };
  return cached.db;
}

export async function closeDb(): Promise<void> {
  if (!cached) return;
  await cached.pool.end();
  cached = undefined;
}
