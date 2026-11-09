import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import {
  DrizzleSubscriptionRepository,
  DrizzleUsageRepository,
  EntitlementService,
  SubscriptionService,
  type PaymentProvider,
} from '@linkediner/core/billing';
import type { QuotaGate } from '@linkediner/core/shared';
import { createFieldCipher } from '@linkediner/core/crypto';
import { S3ObjectStorage } from '@linkediner/core/documents';
import {
  ApplicationService,
  DrizzleApplicationRepository,
  DrizzleMaterialRepository,
  MaterialService,
  type GenerateMaterialJob,
} from '@linkediner/core/applications';
import { DrizzleProductEvents, ProductEvents, TrackingAuditLog } from '@linkediner/core/analytics';
import { DrizzleAuditLog } from '@linkediner/core/audit';
import { createAuth, DrizzleUserReader } from '@linkediner/core/identity';
import { ConsentService, DrizzleConsentRepository } from '@linkediner/core/privacy';
import {
  AccountDeletionService,
  DataExportService,
  DrizzleAccountDataReader,
  DrizzleAccountDeletionRepository,
  DrizzleDataExportRepository,
  type ExportUserJob,
  type PurgeUserJob,
} from '@linkediner/core/privacy/account';
import { ExtractionRequests, type ExtractJobPayload } from '@linkediner/core/extraction';
import {
  DrizzleFactRepository,
  DrizzleProfileRepository,
  DrizzleScoreRepository,
  FactService,
  ProfileScoreService,
  ProfileService,
} from '@linkediner/core/profile';
import { DocumentService, DrizzleDocumentRepository } from '@linkediner/core/documents';
import {
  DocxResumeRenderer,
  PdfResumeRenderer,
  ResumeExportService,
} from '@linkediner/core/resumes/export';
import {
  DrizzleResumeRepository,
  ResumeAtsService,
  ResumeService,
  type GenerateResumeJob,
} from '@linkediner/core/resumes';
import { DiscoveryService, DrizzleCatalogReader } from '@linkediner/core/discovery';
import { DrizzleJobRepository, JobService, type StructureJobPayload } from '@linkediner/core/jobs';
import {
  DrizzleFeedbackRepository,
  DrizzleMatchRepository,
  FeedbackService,
  MatchingService,
} from '@linkediner/core/matching';
import { startTestS3 } from '@linkediner/core/testing';
import { startTestDatabase } from '@linkediner/db/testing';
import { createLogger, createPseudonymizer } from '@linkediner/observability';
import { buildServer } from '../server';

export const WEB = 'http://localhost:3000';
// Senha fictícia, usada apenas em testes.
export const TEST_PASSWORD = 'senha-forte-123'; // gitleaks:allow

/** Sobe Postgres e S3 em containers e a API completa, como em produção, para testes de integração. */
export async function startTestApp(opts: { realQuota?: boolean; payments?: PaymentProvider } = {}) {
  const [ctx, s3] = await Promise.all([startTestDatabase(), startTestS3()]);
  const db = ctx.handle.db;
  const pseudonymize = createPseudonymizer('p'.repeat(32));
  const events = new ProductEvents(new DrizzleProductEvents(db, pseudonymize), () => {});
  const audit = new TrackingAuditLog(new DrizzleAuditLog(db, pseudonymize), events);
  const consents = new ConsentService(new DrizzleConsentRepository(db), audit);
  const documentRepository = new DrizzleDocumentRepository(db);
  // Bucket separado, como em produção. A chave mestra é aleatória a cada execução.
  const keyStorage = new S3ObjectStorage({ ...s3.config, bucket: 'test-keys' });
  await keyStorage.ensureBucket();
  const masterKeyBase64 = randomBytes(32).toString('base64');
  const cipher = createFieldCipher({ db, keyStorage, masterKeyBase64 });
  const factRepository = new DrizzleFactRepository(db, cipher);
  const profileRepository = new DrizzleProfileRepository(db);
  const jobRepository = new DrizzleJobRepository(db);
  const resumeRepository = new DrizzleResumeRepository(db, cipher);
  const userReader = new DrizzleUserReader(db);
  const applicationRepository = new DrizzleApplicationRepository(db, cipher);
  const materialRepository = new DrizzleMaterialRepository(db, cipher);
  const entitlements = new EntitlementService(new DrizzleUsageRepository(db));
  // Por padrão sem limites: só os testes de planos dependem deles. Os outros testam o próprio fluxo.
  const quota: QuotaGate = opts.realQuota
    ? entitlements
    : { consume: async () => {}, refund: async () => {} };
  const subscriptions = new SubscriptionService(
    new DrizzleSubscriptionRepository(db),
    opts.payments ?? null,
    audit,
    { web: WEB },
  );
  const scores = new ProfileScoreService(
    profileRepository,
    factRepository,
    new DrizzleScoreRepository(db),
  );
  // Fila em memória: os testes decidem quando processar cada job.
  const queue = {
    jobs: [] as ExtractJobPayload[],
    enqueue: async (job: ExtractJobPayload) => {
      queue.jobs.push(job);
    },
  };
  const jobQueue = {
    jobs: [] as StructureJobPayload[],
    enqueue: async (job: StructureJobPayload) => {
      jobQueue.jobs.push(job);
    },
  };
  const resumeQueue = {
    jobs: [] as GenerateResumeJob[],
    enqueue: async (job: GenerateResumeJob) => {
      resumeQueue.jobs.push(job);
    },
  };
  const materialQueue = {
    jobs: [] as GenerateMaterialJob[],
    enqueue: async (job: GenerateMaterialJob) => {
      materialQueue.jobs.push(job);
    },
  };
  const purgeQueue = {
    jobs: [] as PurgeUserJob[],
    enqueue: async (job: PurgeUserJob) => {
      purgeQueue.jobs.push(job);
    },
  };
  const exportQueue = {
    jobs: [] as ExportUserJob[],
    enqueue: async (job: ExportUserJob) => {
      exportQueue.jobs.push(job);
    },
  };
  const app = await buildServer({
    config: { NODE_ENV: 'test', WEB_ORIGIN: WEB },
    logger: createLogger({
      service: 'test',
      level: 'silent',
      destination: new Writable({ write: (_c, _e, cb) => cb() }),
    }),
    health: { checks: {} },
    account: {
      syntheticDataOnly: false,
      auth: createAuth({
        db,
        audit,
        pseudonymize,
        config: {
          NODE_ENV: 'test',
          AUTH_SECRET: 's'.repeat(32),
          API_PUBLIC_URL: 'http://localhost:4000',
          WEB_ORIGIN: WEB,
        },
      }),
      users: userReader,
      consents,
      profile: new ProfileService(profileRepository),
      scores,
      facts: new FactService(factRepository, audit),
      documents: new DocumentService(documentRepository, s3.storage, audit, {
        deleteForDocument: (userId, documentId) =>
          factRepository.deleteUnconfirmedForDocument(userId, documentId),
      }),
      applications: new ApplicationService(
        applicationRepository,
        jobRepository,
        resumeRepository,
        materialRepository,
        audit,
        quota,
      ),
      materials: new MaterialService(
        materialRepository,
        applicationRepository,
        jobRepository,
        factRepository,
        consents,
        materialQueue,
        audit,
        quota,
      ),
      discovery: new DiscoveryService(
        new DrizzleCatalogReader(db),
        jobRepository,
        factRepository,
        profileRepository,
        new DrizzleFeedbackRepository(db),
        audit,
        // Sem limites reais, o plano libera tudo, como nos outros testes de fluxo.
        {
          allowed: (userId) =>
            opts.realQuota
              ? entitlements.enabled(userId, 'monitoring.frequency_hours')
              : Promise.resolve(true),
        },
      ),
      feedback: new FeedbackService(
        new DrizzleFeedbackRepository(db),
        jobRepository,
        factRepository,
        profileRepository,
        applicationRepository,
        audit,
      ),
      matching: new MatchingService(
        jobRepository,
        factRepository,
        profileRepository,
        new DrizzleMatchRepository(db),
      ),
      jobs: new JobService(jobRepository, consents, jobQueue, audit, quota),
      resumeAts: new ResumeAtsService({
        resumes: resumeRepository,
        profiles: profileRepository,
        jobs: jobRepository,
      }),
      resumeExport: new ResumeExportService({
        resumes: resumeRepository,
        users: userReader,
        profiles: profileRepository,
        renderers: { pdf: new PdfResumeRenderer(), docx: new DocxResumeRenderer() },
        policy: { watermark: (userId) => entitlements.enabled(userId, 'export.watermark') },
        audit,
      }),
      resumes: new ResumeService(
        resumeRepository,
        factRepository,
        consents,
        resumeQueue,
        audit,
        quota,
      ),
      extraction: new ExtractionRequests(documentRepository, consents, queue, quota),
      entitlements,
      subscriptions,
      events,
      accountDeletion: new AccountDeletionService(
        new DrizzleAccountDeletionRepository(db),
        purgeQueue,
        audit,
        pseudonymize,
      ),
      dataExports: new DataExportService(
        new DrizzleDataExportRepository(db),
        s3.storage,
        exportQueue,
        audit,
      ),
    },
  });

  /** Cria um usuário e devolve o cabeçalho de cookie da sessão. */
  async function signUp(email: string, { acceptConsents = true } = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up/email',
      headers: { origin: WEB, 'content-type': 'application/json' },
      payload: { email, password: TEST_PASSWORD, name: 'Pessoa Teste' },
    });
    if (res.statusCode !== 200) throw new Error(`cadastro falhou: ${res.statusCode}`);
    const cookie = res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    if (acceptConsents) {
      for (const purpose of ['terms', 'privacy']) {
        await app.inject({
          method: 'PUT',
          url: `/v1/me/consents/${purpose}`,
          headers: { cookie, origin: WEB, 'content-type': 'application/json' },
          payload: { granted: true },
        });
      }
    }
    return cookie;
  }

  /** Requisição autenticada com Origin do frontend. */
  const call = (
    cookie: string,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: unknown,
  ) =>
    app.inject({
      method,
      url,
      headers: {
        cookie,
        origin: WEB,
        ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
    });

  return {
    app,
    db: ctx.handle,
    storage: s3.storage,
    pseudonymize,
    accountDataReader: new DrizzleAccountDataReader(db, cipher, pseudonymize),
    keyStorage,
    masterKeyBase64,
    cipher,
    quota,
    entitlements,
    subscriptions,
    audit,
    consents,
    queue,
    resumeQueue,
    jobQueue,
    materialQueue,
    purgeQueue,
    exportQueue,
    scores,
    signUp,
    call,
    stop: async () => {
      await app.close();
      await Promise.all([ctx.stop(), s3.stop()]);
    },
  };
}
