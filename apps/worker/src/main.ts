import { PgBoss } from 'pg-boss';
import { loadConfig } from '@linkediner/config';
import { createDb, pingDb } from '@linkediner/db';
import {
  coverLetterV1,
  createAiProvider,
  DrizzleAiGenerationLog,
  extractProfileV1,
  FakeAiProvider,
  formAnswersV1,
  generateResumeV1,
  structureJobV1,
  tailorResumeV1,
} from '@linkediner/core/ai';
import {
  DrizzleApplicationRepository,
  DrizzleMaterialRepository,
  GenerateMaterial,
} from '@linkediner/core/applications';
import { DrizzleJobRepository, EMPTY_JOB_OUTPUT, StructureJob } from '@linkediner/core/jobs';
import { DrizzleResumeRepository, GenerateResume } from '@linkediner/core/resumes';
import { DrizzleProductEvents, ProductEvents, TrackingAuditLog } from '@linkediner/core/analytics';
import { DrizzleAuditLog } from '@linkediner/core/audit';
import {
  createPaymentProvider,
  DrizzleSubscriptionRepository,
  DrizzleUsageRepository,
  EntitlementService,
  SubscriptionService,
} from '@linkediner/core/billing';
import { createFieldCipher } from '@linkediner/core/crypto';
import {
  DrizzleCatalogRepository,
  GreenhouseAdapter,
  LeverAdapter,
  StructureCatalog,
  SyncCatalog,
} from '@linkediner/core/discovery';
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
  DrizzleAccountDataReader,
  DrizzleAccountDeletionRepository,
  DrizzleDataExportRepository,
  EXPORT_USER_QUEUE,
  ExpireExports,
  ExportUserData,
  PurgeUser,
} from '@linkediner/core/privacy/account';
import { buildExportZip } from '@linkediner/core/privacy/account-worker';
import { DOCUMENTS_EXTRACT_QUEUE } from '@linkediner/core/extraction';
import { MATERIALS_GENERATE_QUEUE } from '@linkediner/core/applications';
import { JOBS_STRUCTURE_QUEUE } from '@linkediner/core/jobs';
import { RESUMES_GENERATE_QUEUE } from '@linkediner/core/resumes';
import {
  DrizzleFactRepository,
  DrizzleProfileRepository,
  DrizzleScoreRepository,
  ProfileScoreService,
} from '@linkediner/core/profile';
import { createLogger, createPseudonymizer } from '@linkediner/observability';
import { applicationsGenerateMaterial } from './handlers/applications-generate-material';
import {
  privacyExpireExports,
  privacyExportUser,
  privacyPurgeUser,
  privacyResumePurges,
} from './handlers/privacy-account';
import { PgBossPendingTasks } from './pg-boss-pending-tasks';
import { analyticsExpireEvents } from './handlers/analytics-expire-events';
import { documentsExtract } from './handlers/documents-extract';
import { jobsStructure } from './handlers/jobs-structure';
import { resumesGenerate } from './handlers/resumes-generate';
import { privacyExpireAiGenerations } from './handlers/privacy-expire-ai-generations';
import { sourcesStructure, sourcesSync } from './handlers/sources-catalog';
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
const pseudonymize = createPseudonymizer(config.LOG_PSEUDONYM_SECRET);
const productEvents = new DrizzleProductEvents(database.db, pseudonymize);
// Métricas não derrubam um fluxo: a falha só vai para o log, sem o conteúdo do evento.
const audit = new TrackingAuditLog(
  new DrizzleAuditLog(database.db, pseudonymize),
  new ProductEvents(productEvents, (err) =>
    logger.warn({ err }, 'falha ao registrar evento de produto'),
  ),
);
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
  ai.respond('generate_cover_letter', () => ({ paragraphs: [] }));
  ai.respond('answer_form', () => ({ answers: [] }));
}
const cipher = createFieldCipher({
  db: database.db,
  keyStorage: new S3ObjectStorage({
    bucket: config.STORAGE_KEYS_BUCKET,
    region: config.STORAGE_REGION,
    endpoint: config.STORAGE_ENDPOINT,
    accessKeyId: config.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: config.STORAGE_SECRET_ACCESS_KEY,
  }),
  masterKeyBase64: config.DATA_MASTER_KEY,
});
const generations = new DrizzleAiGenerationLog(database.db, cipher);
const factRepository = new DrizzleFactRepository(database.db, cipher);
const quota = new EntitlementService(new DrizzleUsageRepository(database.db));
const boss = new PgBoss({ connectionString: config.DATABASE_URL, schema: 'pgboss' });

boss.on('error', (err) => logger.error({ err }, 'erro no pg-boss'));

await boss.start();
const purge = new PurgeUser({
  repo: new DrizzleAccountDeletionRepository(database.db),
  storage,
  keys: cipher,
  subscriptions: new SubscriptionService(
    new DrizzleSubscriptionRepository(database.db),
    createPaymentProvider(config),
    audit,
    { web: config.WEB_ORIGIN },
  ),
  // Toda fila cujo payload tem `userId`. A do próprio expurgo fica de fora.
  tasks: new PgBossPendingTasks(boss, [
    DOCUMENTS_EXTRACT_QUEUE.name,
    RESUMES_GENERATE_QUEUE.name,
    JOBS_STRUCTURE_QUEUE.name,
    MATERIALS_GENERATE_QUEUE.name,
    EXPORT_USER_QUEUE.name,
  ]),
});
const exportRepository = new DrizzleDataExportRepository(database.db);
const catalog = new DrizzleCatalogRepository(database.db);
const tasks = [
  systemHeartbeat({ ping: () => pingDb(database.db) }),
  sourcesSync({
    sync: new SyncCatalog({ catalog, adapters: [new GreenhouseAdapter(), new LeverAdapter()] }),
  }),
  sourcesStructure({
    structure: new StructureCatalog({
      catalog,
      ai,
      prompt: structureJobV1,
      // Teto por rodada, a cada 30 minutos. O intervalo respeita as 15 chamadas por minuto do plano gratuito.
      limit: 40,
      intervalMs: 4500,
    }),
  }),
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
      quota,
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
      quota,
      audit,
    }),
  }),
  resumesGenerate({
    generate: new GenerateResume({
      resumes: new DrizzleResumeRepository(database.db, cipher),
      facts: factRepository,
      consents: new ConsentService(new DrizzleConsentRepository(database.db), audit),
      ai,
      prompt: generateResumeV1,
      generations,
      quota,
      audit,
    }),
  }),
  applicationsGenerateMaterial({
    generate: new GenerateMaterial({
      materials: new DrizzleMaterialRepository(database.db, cipher),
      applications: new DrizzleApplicationRepository(database.db, cipher),
      jobs: new DrizzleJobRepository(database.db),
      facts: factRepository,
      consents: new ConsentService(new DrizzleConsentRepository(database.db), audit),
      ai,
      prompts: {
        resume: tailorResumeV1,
        cover_letter: coverLetterV1,
        form_answers: formAnswersV1,
      },
      generations,
      quota,
      audit,
    }),
  }),
  privacyPurgeUser({ purge }),
  privacyResumePurges({ purge }),
  privacyExportUser({
    exporter: new ExportUserData({
      repo: exportRepository,
      reader: new DrizzleAccountDataReader(database.db, cipher, pseudonymize),
      storage,
      zip: buildExportZip,
      audit,
    }),
  }),
  privacyExpireExports({ expire: new ExpireExports(exportRepository, storage) }),
  analyticsExpireEvents({ events: productEvents }),
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
