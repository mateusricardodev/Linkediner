import { PgBoss } from 'pg-boss';
import { loadConfig } from '@linkediner/config';
import { createDb, pingDb } from '@linkediner/db';
import { createLogger } from '@linkediner/observability';
import { systemHeartbeat } from './handlers/system-heartbeat';
import { registerTasks } from './runner';

const config = loadConfig();
const logger = createLogger({
  service: 'worker',
  level: config.LOG_LEVEL,
  pretty: config.NODE_ENV === 'development',
});
const database = createDb(config.DATABASE_URL, { max: 4 });
const boss = new PgBoss({ connectionString: config.DATABASE_URL, schema: 'pgboss' });

boss.on('error', (err) => logger.error({ err }, 'erro no pg-boss'));

await boss.start();
await registerTasks(
  boss,
  [systemHeartbeat({ ping: () => pingDb(database.db) })],
  logger,
  config.WORKER_CONCURRENCY,
);
logger.info('worker iniciado');

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'encerrando worker');
  await boss.stop({ graceful: true, timeout: 30_000 });
  await database.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
