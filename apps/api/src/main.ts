import { loadConfig } from '@linkediner/config';
import { createDb, pingDb } from '@linkediner/db';
import { DrizzleAuditLog } from '@linkediner/core/audit';
import { createAuth, DrizzleUserReader } from '@linkediner/core/identity';
import { ConsentService, DrizzleConsentRepository } from '@linkediner/core/privacy';
import { DrizzleProfileRepository, ProfileService } from '@linkediner/core/profile';
import {
  DocumentService,
  DrizzleDocumentRepository,
  S3ObjectStorage,
} from '@linkediner/core/documents';
import { createLogger, createPseudonymizer } from '@linkediner/observability';
import { buildServer } from './server';

const config = loadConfig();
const logger = createLogger({
  service: 'api',
  level: config.LOG_LEVEL,
  pretty: config.NODE_ENV === 'development',
});
const database = createDb(config.DATABASE_URL);
const pseudonymize = createPseudonymizer(config.LOG_PSEUDONYM_SECRET);
const audit = new DrizzleAuditLog(database.db, pseudonymize);
const storage = new S3ObjectStorage({
  bucket: config.STORAGE_BUCKET,
  region: config.STORAGE_REGION,
  endpoint: config.STORAGE_ENDPOINT,
  accessKeyId: config.STORAGE_ACCESS_KEY_ID,
  secretAccessKey: config.STORAGE_SECRET_ACCESS_KEY,
});
// Em produção o bucket é criado pela infraestrutura, com regra de expiração de 30 dias.
if (config.NODE_ENV === 'development') await storage.ensureBucket();

const app = await buildServer({
  config,
  logger,
  health: { checks: { database: () => pingDb(database.db) } },
  account: {
    auth: createAuth({ db: database.db, config, audit, pseudonymize }),
    users: new DrizzleUserReader(database.db),
    consents: new ConsentService(new DrizzleConsentRepository(database.db), audit),
    profile: new ProfileService(new DrizzleProfileRepository(database.db)),
    documents: new DocumentService(new DrizzleDocumentRepository(database.db), storage, audit),
  },
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
