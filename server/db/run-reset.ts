import { closeDb, getDb } from './client.js';
import { resetDemoData } from './seed.js';

resetDemoData(getDb())
  .then(({ appointments }) => console.log(`Demo data reset (${appointments} appointments).`))
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
