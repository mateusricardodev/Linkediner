import { PgBoss } from 'pg-boss';
import { loadConfig } from '@linkediner/config';
import { createDb, pingDb } from '@linkediner/db';
import {
  createAiProvider,
  DrizzleAiGenerationLog,
  extractProfileV1,
  FakeAiProvider,
  generateResumeV1,
  structureJobV1,
} from '@linkediner/core/ai';
import { DrizzleJobRepository, EMPTY_JOB_OUTPUT, StructureJob } from '@linkediner/core/jobs';
import { DrizzleResumeRepository, GenerateResume } from '@linkediner/core/resumes';
import { DrizzleAuditLog } from '@linkediner/core/audit';
import {
  DrizzleDocumentRepository,
  DrizzleDocumentRetentionRepository,
  ExpireDocuments,
  S3ObjectStorage,
} from '@linkediner/core/documents';
import {
  EMPTY_EXTRACTION,
  ExtractDocument,
  FileTextExtractor,
} from '@linkediner/core/extraction/worker';
import { DrizzleUserReader } from '@linkediner/core/identity/users';
import { ConsentService, DrizzleConsentRepository } from '@linkediner/core/privacy';
import {
  DrizzleFactRepository,
  DrizzleProfileRepository,
  DrizzleScoreRepository,
  ProfileScoreService,
} from '@linkediner/core/profile';
import { createLogger, createPseudonymizer } from '@linkediner/observability';
import { documentsExtract } from './handlers/documents-extract';
import { jobsStructure } from './handlers/jobs-structure';
import { resumesGenerate } from './handlers/resumes-generate';
import { privacyExpireAiGenerations } from './handlers/privacy-expire-ai-generations';
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
const ai = createAiProvider(config);
if (ai instanceof FakeAiProvider) {
  // Sem IA real: o fluxo roda de ponta a ponta, mas nenhum fato é extraído.
  logger.warn('provedor de IA simulado: a extração não gera fatos');
  ai.respond('extract_profile', () => EMPTY_EXTRACTION);
  ai.respond('generate_resume', () => ({ summary: [], bullets: [] }));
  ai.respond('structure_job', () => EMPTY_JOB_OUTPUT);
}
const generations = new DrizzleAiGenerationLog(database.db);
const factRepository = new DrizzleFactRepository(database.db);
const boss = new PgBoss({ connectionString: config.DATABASE_URL, schema: 'pgboss' });

boss.on('error', (err) => logger.error({ err }, 'erro no pg-boss'));

await boss.start();
const tasks = [
  systemHeartbeat({ ping: () => pingDb(database.db) }),
  documentsExtract({
    extract: new ExtractDocument({
      documents: new DrizzleDocumentRepository(database.db),
      storage,
      text: new FileTextExtractor(),
      consents: new ConsentService(new DrizzleConsentRepository(database.db), audit),
      users: new DrizzleUserReader(database.db),
      ai,
      prompt: extractProfileV1,
      facts: factRepository,
      generations,
      audit,
    }),
    scores: new ProfileScoreService(
      new DrizzleProfileRepository(database.db),
      factRepository,
      new DrizzleScoreRepository(database.db),
    ),
  }),
  jobsStructure({
    structure: new StructureJob({
      jobs: new DrizzleJobRepository(database.db),
      consents: new ConsentService(new DrizzleConsentRepository(database.db), audit),
      ai,
      prompt: structureJobV1,
      generations,
      audit,
    }),
  }),
  resumesGenerate({
    generate: new GenerateResume({
      resumes: new DrizzleResumeRepository(database.db),
      facts: factRepository,
      consents: new ConsentService(new DrizzleConsentRepository(database.db), audit),
      ai,
      prompt: generateResumeV1,
      generations,
      audit,
    }),
  }),
  privacyExpireAiGenerations({ generations }),
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
