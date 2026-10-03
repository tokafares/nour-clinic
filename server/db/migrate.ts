import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { requireEnv } from '../env.js';

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: requireEnv('DATABASE_URL'), max: 1 });
  try {
    console.log('Running migrations…');
    await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
    console.log('Migrations complete.');
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
