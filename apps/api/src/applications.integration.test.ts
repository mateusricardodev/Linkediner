import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleApplicationRepository } from '@linkediner/core/applications';
import { DrizzleJobRepository, jobDedupeHash } from '@linkediner/core/jobs';
import { DrizzleResumeRepository, type ResumeContent } from '@linkediner/core/resumes';
import { startTestApp } from './testing/app';

// Dados fictícios. A candidatura não usa IA, e nada é enviado a nenhuma fonte.
let t: Awaited<ReturnType<typeof startTestApp>>;
let jobs: DrizzleJobRepository;
let resumes: DrizzleResumeRepository;

const CONTENT: ResumeContent = {
  summary: [],
  experiences: [],
  skills: ['TypeScript'],
  education: [],
  certifications: [],
  projects: [],
  languages: [],
};

beforeAll(async () => {
  t = await startTestApp();
  jobs = new DrizzleJobRepository(t.db.db);
  resumes = new DrizzleResumeRepository(t.db.db, t.cipher);
}, 180_000);

afterAll(async () => t?.stop());

async function setup(email: string) {
  const cookie = await t.signUp(email);
  const userId = (await t.call(cookie, 'GET', '/v1/me')).json().user.id as string;

  const jobId = crypto.randomUUID();
  await jobs.insert(userId, {
    id: jobId,
    rawText: `Vaga fictícia ${jobId}`,
    applyUrl: 'https://empresa.example/vaga',
    dedupeHash: jobDedupeHash(jobId),
  });
  await jobs.saveFields(userId, jobId, {
    title: 'Engenheira Frontend',
    company: 'Empresa Fictícia',
    location: null,
    employmentType: null,
    salaryText: null,
    remotePolicy: 'remote',
    seniority: null,
    mustHave: ['React'],
    niceToHave: [],
  });

  const resumeId = crypto.randomUUID();
  await resumes.insertGenerating(userId, resumeId, { language: 'pt', jobId: null });
  await resumes.saveDraft(userId, resumeId, CONTENT);
  await resumes.approve(userId, resumeId, new Date());
  return { cookie, userId, jobId, resumeId };
}

const post = (cookie: string, path: string, body?: unknown) => t.call(cookie, 'POST', path, body);
const stateOf = async (cookie: string, id: string) =>
  (await t.call(cookie, 'GET', `/v1/applications/${id}`)).json().application.state as string;

async function atApproval(cookie: string, jobId: string, resumeId: string) {
  const id = (await post(cookie, '/v1/applications', { jobId })).json().id as string;
  await t.call(cookie, 'PUT', `/v1/applications/${id}/resume`, { resumeId });
  await post(cookie, `/v1/applications/${id}/submit-for-approval`);
  return id;
}

describe('fluxo da candidatura', () => {
  it('percorre o caminho completo, com histórico de cada passo', async () => {
    const { cookie, jobId, resumeId } = await setup('cand-fluxo@example.com');
    const created = await post(cookie, '/v1/applications', { jobId });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      state: 'saved',
      job: { title: 'Engenheira Frontend', company: 'Empresa Fictícia' },
    });
    const id = created.json().id as string;

    const attached = await t.call(cookie, 'PUT', `/v1/applications/${id}/resume`, { resumeId });
    expect(attached.json()).toMatchObject({ state: 'in_review', resumeId });
    await post(cookie, `/v1/applications/${id}/submit-for-approval`);
    expect(await stateOf(cookie, id)).toBe('awaiting_approval');

    const approved = await post(cookie, `/v1/applications/${id}/approve`);
    expect(approved.json()).toMatchObject({
      state: 'manual_action_required',
      submissionMode: 'assisted',
      submittedAt: null,
    });

    const sent = await post(cookie, `/v1/applications/${id}/manual-complete`);
    expect(sent.json()).toMatchObject({ state: 'sent', submissionMode: 'manual' });
    expect(sent.json().submittedAt).toBeTruthy();

    await post(cookie, `/v1/applications/${id}/outcome`, { outcome: 'interview_received' });

    const detail = (await t.call(cookie, 'GET', `/v1/applications/${id}`)).json();
    expect(detail.events.map((e: { to: string }) => e.to)).toEqual([
      'saved',
      'analyzing',
      'in_review',
      'awaiting_approval',
      'approved',
      'manual_action_required',
      'sent',
      'interview_received',
    ]);
    expect(detail.events.find((e: { to: string }) => e.to === 'approved').actor).toBe('user');
    expect(detail.manualTasks).toHaveLength(1);
    expect(detail.manualTasks[0].resolvedAt).toBeTruthy();
  });

  it('salvar a mesma vaga de novo devolve a mesma candidatura', async () => {
    const { cookie, jobId } = await setup('cand-repete@example.com');
    const a = await post(cookie, '/v1/applications', { jobId });
    const b = await post(cookie, '/v1/applications', { jobId });
    expect(b.json().id).toBe(a.json().id);
  });

  it('não aprova sem passar pelo estado de aprovação, nem pula direto para enviada', async () => {
    const { cookie, jobId } = await setup('cand-pula@example.com');
    const id = (await post(cookie, '/v1/applications', { jobId })).json().id as string;
    const approve = await post(cookie, `/v1/applications/${id}/approve`);
    expect(approve.statusCode).toBe(409);
    const complete = await post(cookie, `/v1/applications/${id}/manual-complete`);
    expect(complete.statusCode).toBe(409);
    expect(complete.json().code).toBe('INVALID_STATE_TRANSITION');
    expect(await stateOf(cookie, id)).toBe('saved');
  });

  it('só aceita currículo aprovado', async () => {
    const { cookie, userId, jobId } = await setup('cand-rascunho@example.com');
    const draftId = crypto.randomUUID();
    await resumes.insertGenerating(userId, draftId, { language: 'pt', jobId: null });
    await resumes.saveDraft(userId, draftId, CONTENT);
    const id = (await post(cookie, '/v1/applications', { jobId })).json().id as string;
    const res = await t.call(cookie, 'PUT', `/v1/applications/${id}/resume`, { resumeId: draftId });
    expect(res.statusCode).toBe(409);
  });

  it('pedir ajustes volta para a revisão, e desistir encerra', async () => {
    const { cookie, jobId, resumeId } = await setup('cand-ajuste@example.com');
    const id = await atApproval(cookie, jobId, resumeId);
    await post(cookie, `/v1/applications/${id}/request-changes`);
    expect(await stateOf(cookie, id)).toBe('in_review');
    await post(cookie, `/v1/applications/${id}/close`);
    expect(await stateOf(cookie, id)).toBe('closed');
    expect((await post(cookie, `/v1/applications/${id}/close`)).statusCode).toBe(409);
  });

  it('o material aprovado fica congelado, mesmo se o currículo mudar depois', async () => {
    const { cookie, userId, jobId, resumeId } = await setup('cand-congela@example.com');
    const id = await atApproval(cookie, jobId, resumeId);
    await post(cookie, `/v1/applications/${id}/approve`);

    await resumes.updateContent(userId, resumeId, (content) => {
      content.skills = ['Alterado depois'];
    });
    const { rows } = await t.db.pool.query(
      'SELECT material_snapshot FROM applications WHERE id = $1',
      [id],
    );
    expect(JSON.stringify(rows[0].material_snapshot)).not.toContain('TypeScript');
    const material = await new DrizzleApplicationRepository(t.db.db, t.cipher).material(userId, id);
    expect(material?.skills).toEqual(['TypeScript']);

    const file = await t.call(cookie, 'GET', `/v1/applications/${id}/resume?format=pdf`);
    expect(file.statusCode).toBe(200);
    expect(file.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('não baixa material antes da aprovação', async () => {
    const { cookie, jobId, resumeId } = await setup('cand-sem-material@example.com');
    const id = await atApproval(cookie, jobId, resumeId);
    const file = await t.call(cookie, 'GET', `/v1/applications/${id}/resume?format=pdf`);
    expect(file.statusCode).toBe(409);
  });

  it('o histórico continua legível depois que a vaga é apagada', async () => {
    const { cookie, jobId } = await setup('cand-apaga-vaga@example.com');
    const id = (await post(cookie, '/v1/applications', { jobId })).json().id as string;
    await t.call(cookie, 'DELETE', `/v1/jobs/${jobId}`);
    const detail = (await t.call(cookie, 'GET', `/v1/applications/${id}`)).json();
    expect(detail.application).toMatchObject({
      jobId: null,
      job: { title: 'Engenheira Frontend' },
    });
  });

  it('outro usuário não vê nem altera a candidatura (404)', async () => {
    const { cookie, jobId, resumeId } = await setup('cand-dono@example.com');
    const id = await atApproval(cookie, jobId, resumeId);
    const other = await t.signUp('cand-outro@example.com');
    expect((await t.call(other, 'GET', '/v1/applications')).json()).toEqual([]);
    expect((await t.call(other, 'GET', `/v1/applications/${id}`)).statusCode).toBe(404);
    expect((await post(other, `/v1/applications/${id}/approve`)).statusCode).toBe(404);
    expect((await post(other, '/v1/applications', { jobId })).statusCode).toBe(404);
    expect(await stateOf(cookie, id)).toBe('awaiting_approval');
  });

  it('a aplicação não consegue alterar nem apagar o histórico', async () => {
    const { rows } = await t.db.pool.query(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE grantee = 'linkediner_app' AND table_name = 'application_events'`,
    );
    expect(rows.map((r) => r.privilege_type).sort()).toEqual(['INSERT', 'SELECT']);
  });
});

describe('dashboard', () => {
  it('mostra contagens e o que precisa de atenção, só do próprio usuário', async () => {
    const { cookie, jobId, resumeId } = await setup('cand-dash@example.com');
    const id = await atApproval(cookie, jobId, resumeId);
    await post(cookie, `/v1/applications/${id}/approve`);

    const dashboard = (await t.call(cookie, 'GET', '/v1/dashboard')).json();
    expect(dashboard).toMatchObject({
      total: 1,
      sent: 0,
      interviews: 0,
      counts: { manual_action_required: 1 },
    });
    expect(dashboard.needsAttention[0].id).toBe(id);

    const other = await t.signUp('cand-dash-outro@example.com');
    expect((await t.call(other, 'GET', '/v1/dashboard')).json()).toMatchObject({
      total: 0,
      needsAttention: [],
    });
  });

  it('filtra a lista por estado', async () => {
    const { cookie, jobId } = await setup('cand-filtro@example.com');
    await post(cookie, '/v1/applications', { jobId });
    const saved = await t.call(cookie, 'GET', '/v1/applications?state=saved');
    const sent = await t.call(cookie, 'GET', '/v1/applications?state=sent');
    expect(saved.json()).toHaveLength(1);
    expect(sent.json()).toEqual([]);
  });
});
