import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleAccountDeletionRepository, PurgeUser } from '@linkediner/core/privacy/account';
import { DrizzleJobRepository, jobDedupeHash } from '@linkediner/core/jobs';
import { DrizzleResumeRepository } from '@linkediner/core/resumes';
import { startTestApp } from './testing/app';

// Dados fictícios.
let t: Awaited<ReturnType<typeof startTestApp>>;

beforeAll(async () => {
  t = await startTestApp();
}, 180_000);
afterAll(async () => t?.stop());

async function setup(email: string) {
  const cookie = await t.signUp(email);
  const userId = (await t.call(cookie, 'GET', '/v1/me')).json().user.id as string;
  return { cookie, userId };
}

async function readyJob(userId: string, n = 1) {
  const jobs = new DrizzleJobRepository(t.db.db);
  const jobId = crypto.randomUUID();
  await jobs.insert(userId, {
    id: jobId,
    rawText: `Vaga fictícia ${jobId}`,
    applyUrl: null,
    dedupeHash: jobDedupeHash(jobId),
  });
  await jobs.saveFields(userId, jobId, {
    title: `Vaga ${n}`,
    company: 'Empresa Fictícia',
    location: null,
    employmentType: null,
    salaryText: null,
    remotePolicy: 'remote',
    seniority: null,
    mustHave: ['React'],
    niceToHave: [],
  });
  return jobId;
}

async function approvedResume(userId: string) {
  const resumes = new DrizzleResumeRepository(t.db.db, t.cipher);
  const id = crypto.randomUUID();
  await resumes.insertGenerating(userId, id, { language: 'pt', jobId: null });
  await resumes.saveDraft(userId, id, {
    summary: [],
    experiences: [],
    skills: ['React'],
    education: [],
    certifications: [],
    projects: [],
    languages: [],
  });
  await resumes.approve(userId, id, new Date());
  return id;
}

/** Leva a candidatura até enviada. */
async function sendApplication(cookie: string, jobId: string, resumeId: string) {
  const id = (await t.call(cookie, 'POST', '/v1/applications', { jobId })).json().id as string;
  await t.call(cookie, 'PUT', `/v1/applications/${id}/resume`, { resumeId });
  await t.call(cookie, 'POST', `/v1/applications/${id}/submit-for-approval`);
  await t.call(cookie, 'POST', `/v1/applications/${id}/approve`);
  await t.call(cookie, 'POST', `/v1/applications/${id}/manual-complete`);
  return id;
}

const ref = (userId: string) => t.pseudonymize(userId);
const eventsOf = async (userId: string) =>
  (
    await t.db.pool.query(
      'SELECT name, properties, dedupe_key FROM product_events WHERE user_ref = $1',
      [ref(userId)],
    )
  ).rows as { name: string; properties: Record<string, unknown>; dedupe_key: string | null }[];
const countOf = async (userId: string, name: string) =>
  (await eventsOf(userId)).filter((e) => e.name === name).length;

describe('eventos de produto', () => {
  it('registra os passos do fluxo, sem o ID real nem dado pessoal', async () => {
    const email = 'evt-fluxo@example.com';
    const { cookie, userId } = await setup(email);
    const jobId = await readyJob(userId);
    const resumeId = await approvedResume(userId);
    const id = await sendApplication(cookie, jobId, resumeId);
    await t.call(cookie, 'POST', `/v1/applications/${id}/outcome`, {
      outcome: 'interview_received',
    });

    const names = (await eventsOf(userId)).map((e) => e.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'user_signed_up',
        'application_created',
        'application_approved',
        'application_sent',
        'manual_task_completed',
        'application_outcome_reported',
        'interview_reported',
      ]),
    );

    const { rows } = await t.db.pool.query('SELECT * FROM product_events');
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(userId);
    expect(dump).not.toContain(email);
  });

  it('ver ou receber a mesma vaga de novo não conta duas vezes', async () => {
    const { cookie, userId } = await setup('evt-dedupe@example.com');
    const jobId = await readyJob(userId);
    await t.call(cookie, 'GET', `/v1/jobs/${jobId}`);
    await t.call(cookie, 'GET', `/v1/jobs/${jobId}`);
    await t.call(cookie, 'GET', '/v1/jobs/recommendations');
    await t.call(cookie, 'GET', '/v1/jobs/recommendations');
    expect(await countOf(userId, 'job_viewed')).toBe(1);
    expect(await countOf(userId, 'job_recommended')).toBe(1);
  });

  it('a exclusão da conta desliga os eventos dela, e eles seguem no agregado', async () => {
    const email = 'evt-exclui@example.com';
    const { cookie, userId } = await setup(email);
    const before = await countOf(userId, 'user_signed_up');
    expect(before).toBe(1);
    const total = async () =>
      (await t.db.pool.query('SELECT count(*)::int AS n FROM product_events')).rows[0].n as number;
    const totalBefore = await total();

    await t.call(cookie, 'POST', '/v1/privacy/delete-account', { confirmEmail: email });
    await new PurgeUser({
      repo: new DrizzleAccountDeletionRepository(t.db.db),
      storage: t.storage,
      keys: t.cipher,
      subscriptions: t.subscriptions,
      tasks: { cancelForUser: async () => 0 },
    }).run(t.purgeQueue.jobs.at(-1)!, { isLastAttempt: false });

    expect(await eventsOf(userId)).toEqual([]);
    expect(await total()).toBe(totalBefore);
    const { rows } = await t.db.pool.query(
      `SELECT count(*)::int AS n FROM product_events WHERE user_ref LIKE 'anon:%'`,
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it('a exportação traz os eventos da própria pessoa, sem o pseudônimo', async () => {
    const { userId } = await setup('evt-export@example.com');
    const { data } = await t.accountDataReader.read(userId);
    const events = data.product_events as { name: string }[];
    expect(events.map((e) => e.name)).toContain('user_signed_up');
    expect(JSON.stringify(events)).not.toContain(ref(userId));
  });

  it('o papel da aplicação não lê eventos nem as métricas de todos os usuários', async () => {
    const { rows } = await t.db.pool.query(
      `SELECT table_name FROM information_schema.role_table_grants
       WHERE grantee = 'linkediner_app' AND (table_name = 'product_events' OR table_name LIKE 'metric_%')`,
    );
    expect(rows).toEqual([]);
  });
});

describe('métricas', () => {
  const view = async <T>(name: string) =>
    (await t.db.pool.query(`SELECT * FROM ${name}`)).rows as T[];
  const number = (value: unknown) => Number(value);

  it('taxa de entrevistas: só conta enviada nos últimos 60 dias e com compatibilidade alta', async () => {
    const before = (await view<Record<string, unknown>>('metric_interview_rate'))[0]!;
    const { cookie, userId } = await setup('met-entrevista@example.com');
    const resumeId = await approvedResume(userId);

    const addMatch = (jobId: string, score: number | null) =>
      t.db.pool.query(
        `INSERT INTO job_matches (id, user_id, job_id, score, rubric_version, factors, calculated_at)
         VALUES ($1, $2, $3, $4, 'v1', '[]', now())`,
        [crypto.randomUUID(), userId, jobId, score],
      );

    const alta = await readyJob(userId, 1);
    await addMatch(alta, 85);
    const entrevista = await sendApplication(cookie, alta, resumeId);
    await t.call(cookie, 'POST', `/v1/applications/${entrevista}/outcome`, {
      outcome: 'interview_received',
    });

    const altaSem = await readyJob(userId, 2);
    await addMatch(altaSem, 70);
    await sendApplication(cookie, altaSem, resumeId);

    const baixa = await readyJob(userId, 3);
    await addMatch(baixa, 40);
    await sendApplication(cookie, baixa, resumeId);

    const semScore = await readyJob(userId, 4);
    await addMatch(semScore, null);
    await sendApplication(cookie, semScore, resumeId);

    const antiga = await readyJob(userId, 5);
    await addMatch(antiga, 90);
    const velha = await sendApplication(cookie, antiga, resumeId);
    await t.db.pool.query(
      `UPDATE applications SET submitted_at = now() - interval '61 days' WHERE id = $1`,
      [velha],
    );

    const after = (await view<Record<string, unknown>>('metric_interview_rate'))[0]!;
    expect(number(after.sent_relevant) - number(before.sent_relevant)).toBe(2);
    expect(number(after.interviews) - number(before.interviews)).toBe(1);
    expect(number(after.rate)).toBeGreaterThan(0);
  });

  it('funil do mês soma recomendações, candidaturas e avaliações negativas', async () => {
    const { cookie, userId } = await setup('met-funil@example.com');
    const current = async () =>
      (await view<Record<string, unknown>>('metric_funnel_monthly')).sort(
        (a, b) => new Date(b.month as string).getTime() - new Date(a.month as string).getTime(),
      )[0]!;
    const before = await current();

    const job = await readyJob(userId);
    const negative = await readyJob(userId, 2);
    await t.call(cookie, 'GET', '/v1/jobs/recommendations');
    await t.call(cookie, 'GET', `/v1/jobs/${job}`);
    await t.call(cookie, 'PUT', `/v1/jobs/${negative}/feedback`, { reasons: ['disliked'] });
    await t.call(cookie, 'PUT', `/v1/jobs/${job}/feedback`, { reasons: ['liked'] });
    await sendApplication(cookie, job, await approvedResume(userId));

    const after = await current();
    const diff = (key: string) => number(after[key]) - number(before[key]);
    expect(diff('recommended')).toBe(2);
    expect(diff('viewed')).toBe(1);
    expect(diff('created')).toBe(1);
    expect(diff('approved')).toBe(1);
    expect(diff('sent')).toBe(1);
    expect(diff('negative_feedback')).toBe(1);
  });

  it('tempo economizado usa o tempo estimado de cada material gerado', async () => {
    const { userId } = await setup('met-tempo@example.com');
    const current = async () =>
      (await view<{ month: string; minutes: string }>('metric_time_saved_monthly')).reduce(
        (sum, row) => sum + number(row.minutes),
        0,
      );
    const before = await current();
    await t.audit.record({
      actorType: 'system',
      actorId: userId,
      action: 'material.generated',
      metadata: { kind: 'resume' },
    });
    await t.audit.record({
      actorType: 'system',
      actorId: userId,
      action: 'material.generated',
      metadata: { kind: 'cover_letter' },
    });
    await t.audit.record({
      actorType: 'system',
      actorId: userId,
      action: 'material.generated',
      metadata: { kind: 'form_answers' },
    });
    expect((await current()) - before).toBe(60);
  });

  it('candidaturas enviadas por mês e por modo', async () => {
    const rows = await view<{ submission_mode: string; sent: string }>(
      'metric_applications_sent_monthly',
    );
    expect(rows.find((r) => r.submission_mode === 'manual')).toBeDefined();
  });

  it('evolução do score compara o primeiro e o último de cada pessoa', async () => {
    const { userId } = await setup('met-score@example.com');
    const profileId = crypto.randomUUID();
    await t.db.pool.query('INSERT INTO profiles (id, user_id) VALUES ($1, $2)', [
      profileId,
      userId,
    ]);
    for (const [score, ago] of [
      [40, '3 days'],
      [55, '2 days'],
      [70, '1 day'],
    ] as const) {
      await t.db.pool.query(
        `INSERT INTO profile_scores (id, user_id, profile_id, score, rubric_version, factors, created_at)
         VALUES ($1, $2, $3, $4, 'v1', '[]', now() - $5::interval)`,
        [crypto.randomUUID(), userId, profileId, score, ago],
      );
    }
    const [row] = await view<{ users: string; average_change: string }>('metric_score_evolution');
    expect(number(row!.users)).toBe(1);
    expect(number(row!.average_change)).toBe(30);
  });
});
