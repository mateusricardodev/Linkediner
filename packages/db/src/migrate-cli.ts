import { loadConfig } from '@linkediner/config';
import { createDb } from './client';
import { runMigrations } from './migrate';

const config = loadConfig();
const handle = createDb(config.DATABASE_URL, { max: 1 });
try {
  await runMigrations(handle.db);
  console.log('Migrações aplicadas.');
} finally {
  await handle.close();
}
