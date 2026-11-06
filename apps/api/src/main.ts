import { PgBoss } from 'pg-boss';
import { loadConfig } from '@linkediner/config';
import { createDb, pingDb } from '@linkediner/db';
import { ApplicationService, DrizzleApplicationRepository } from '@linkediner/core/applications';
import { DrizzleAuditLog } from '@linkediner/core/audit';
import { createAuth, DrizzleUserReader } from '@linkediner/core/identity';
import { ConsentService, DrizzleConsentRepository } from '@linkediner/core/privacy';
import {
  DOCUMENTS_EXTRACT_QUEUE,
  ExtractionRequests,
  type ExtractJobPayload,
} from '@linkediner/core/extraction';
import {
  DocxResumeRenderer,
  FREE_PLAN_EXPORT_POLICY,
  PdfResumeRenderer,
  ResumeExportService,
} from '@linkediner/core/resumes/export';
import {
  DrizzleResumeRepository,
  RESUMES_GENERATE_QUEUE,
  ResumeService,
  type GenerateResumeJob,
} from '@linkediner/core/resumes';
import {
  DrizzleFactRepository,
  DrizzleProfileRepository,
  DrizzleScoreRepository,
  FactService,
  ProfileScoreService,
  ProfileService,
} from '@linkediner/core/profile';
import {
  DocumentService,
  DrizzleDocumentRepository,
  S3ObjectStorage,
} from '@linkediner/core/documents';
import { createLogger, createPseudonymizer } from '@linkediner/observability';
import {
  DrizzleJobRepository,
  JOBS_STRUCTURE_QUEUE,
  JobService,
  type StructureJobPayload,
} from '@linkediner/core/jobs';
import {
  DrizzleFeedbackRepository,
  DrizzleMatchRepository,
  FeedbackService,
  MatchingService,
} from '@linkediner/core/matching';
import { createQueue } from './pg-boss-queues';
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

// A API só envia jobs: a manutenção e os agendamentos da fila ficam com o worker.
const boss = new PgBoss({
  connectionString: config.DATABASE_URL,
  schema: 'pgboss',
  supervise: false,
  schedule: false,
});
boss.on('error', (err) => logger.error({ err }, 'erro no pg-boss'));
await boss.start();

const consents = new ConsentService(new DrizzleConsentRepository(database.db), audit);
const documentRepository = new DrizzleDocumentRepository(database.db);
const factRepository = new DrizzleFactRepository(database.db);
const profileRepository = new DrizzleProfileRepository(database.db);
const jobRepository = new DrizzleJobRepository(database.db);
const resumeRepository = new DrizzleResumeRepository(database.db);
const userReader = new DrizzleUserReader(database.db);

const app = await buildServer({
  config,
  logger,
  health: { checks: { database: () => pingDb(database.db) } },
  account: {
    auth: createAuth({ db: database.db, config, audit, pseudonymize }),
    users: userReader,
    consents,
    profile: new ProfileService(profileRepository),
    scores: new ProfileScoreService(
      profileRepository,
      factRepository,
      new DrizzleScoreRepository(database.db),
    ),
    facts: new FactService(factRepository, audit),
    documents: new DocumentService(documentRepository, storage, audit, {
      deleteForDocument: (userId, documentId) =>
        factRepository.deleteUnconfirmedForDocument(userId, documentId),
    }),
    applications: new ApplicationService(
      new DrizzleApplicationRepository(database.db),
      jobRepository,
      resumeRepository,
      audit,
    ),
    feedback: new FeedbackService(
      new DrizzleFeedbackRepository(database.db),
      jobRepository,
      factRepository,
      profileRepository,
      audit,
    ),
    matching: new MatchingService(
      jobRepository,
      factRepository,
      profileRepository,
      new DrizzleMatchRepository(database.db),
    ),
    jobs: new JobService(
      jobRepository,
      consents,
      await createQueue<StructureJobPayload>(boss, JOBS_STRUCTURE_QUEUE),
      audit,
    ),
    resumeExport: new ResumeExportService({
      resumes: resumeRepository,
      users: userReader,
      profiles: profileRepository,
      renderers: { pdf: new PdfResumeRenderer(), docx: new DocxResumeRenderer() },
      policy: FREE_PLAN_EXPORT_POLICY,
      audit,
    }),
    resumes: new ResumeService(
      resumeRepository,
      factRepository,
      consents,
      await createQueue<GenerateResumeJob>(boss, RESUMES_GENERATE_QUEUE),
      audit,
    ),
    extraction: new ExtractionRequests(
      documentRepository,
      consents,
      await createQueue<ExtractJobPayload>(boss, DOCUMENTS_EXTRACT_QUEUE),
    ),
  },
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'encerrando');
  await app.close();
  await boss.stop({ graceful: true, timeout: 10_000 });
  await database.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: config.API_HOST, port: config.API_PORT });
