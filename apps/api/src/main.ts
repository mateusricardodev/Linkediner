import { loadConfig } from '@linkediner/config';
import { createDb, pingDb } from '@linkediner/db';
import { createLogger } from '@linkediner/observability';
import { buildServer } from './server';

const config = loadConfig();
const logger = createLogger({
  service: 'api',
  level: config.LOG_LEVEL,
  pretty: config.NODE_ENV === 'development',
});
const database = createDb(config.DATABASE_URL);

const app = await buildServer({
  config,
  logger,
  health: { checks: { database: () => pingDb(database.db) } },
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'encerrando');
  await app.close();
  await database.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: config.API_HOST, port: config.API_PORT });
