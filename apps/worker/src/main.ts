import { PgBoss } from 'pg-boss';
import { loadConfig } from '@linkediner/config';
import { createDb, pingDb } from '@linkediner/db';
import { DrizzleAuditLog } from '@linkediner/core/audit';
import {
  DrizzleDocumentRetentionRepository,
  ExpireDocuments,
  S3ObjectStorage,
} from '@linkediner/core/documents';
import { createLogger, createPseudonymizer } from '@linkediner/observability';
import { privacyExpireDocuments } from './handlers/privacy-expire-documents';
import { systemHeartbeat } from './handlers/system-heartbeat';
import { registerTasks } from './runner';

const config = loadConfig();
const logger = createLogger({
  service: 'worker',
  level: config.LOG_LEVEL,
  pretty: config.NODE_ENV === 'development',
});
const database = createDb(config.DATABASE_URL, { max: 4 });
const audit = new DrizzleAuditLog(database.db, createPseudonymizer(config.LOG_PSEUDONYM_SECRET));
const storage = new S3ObjectStorage({
  bucket: config.STORAGE_BUCKET,
  region: config.STORAGE_REGION,
  endpoint: config.STORAGE_ENDPOINT,
  accessKeyId: config.STORAGE_ACCESS_KEY_ID,
  secretAccessKey: config.STORAGE_SECRET_ACCESS_KEY,
});
const boss = new PgBoss({ connectionString: config.DATABASE_URL, schema: 'pgboss' });

boss.on('error', (err) => logger.error({ err }, 'erro no pg-boss'));

await boss.start();
const tasks = [
  systemHeartbeat({ ping: () => pingDb(database.db) }),
  privacyExpireDocuments({
    expire: new ExpireDocuments(
      new DrizzleDocumentRetentionRepository(database.db),
      storage,
      audit,
    ),
  }),
];
await registerTasks(boss, tasks, logger, config.WORKER_CONCURRENCY);
logger.info('worker iniciado');

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'encerrando worker');
  await boss.stop({ graceful: true, timeout: 30_000 });
  await database.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
