import { closeDb, getDb } from './client.js';
import { DEMO_ADMIN, seed } from './seed.js';

seed(getDb())
  .then(({ appointments }) =>
    console.log(`Seed complete (${appointments} demo appointments). Demo admin: ${DEMO_ADMIN.email} / ${DEMO_ADMIN.password}`),
  )
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
