import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DrizzleAiGenerationLog, FakeAiProvider, structureJobV1 } from '@linkediner/core/ai';
import { DrizzleJobRepository, StructureJob, type JobOutput } from '@linkediner/core/jobs';
import { startTestApp } from './testing/app';

// Vaga fictícia. Nenhuma chamada real de IA acontece aqui.
const TEXT = `Senior Frontend Engineer na Empresa Fictícia. Remoto (Brasil). Faixa: R$ 18.000 a R$ 24.000.
Requisitos: 5 anos com React. TypeScript avançado. Desejável: GraphQL. Contato: rh@empresa.example`;

const OUTPUT: JobOutput = {
  title: 'Senior Frontend Engineer',
  company: 'Empresa Fictícia',
  location: 'Remoto (Brasil)',
  employmentType: null,
  salaryText: 'R$ 18.000 a R$ 24.000',
  remotePolicy: 'remote',
  seniority: 'senior',
  // "Kubernetes" não está na vaga: precisa ser descartado.
  mustHave: ['5 anos com React', 'TypeScript avançado', 'Kubernetes'],
  niceToHave: ['GraphQL'],
};

let t: Awaited<ReturnType<typeof startTestApp>>;
let ai: FakeAiProvider;
let structure: StructureJob;

beforeAll(async () => {
  t = await startTestApp();
  ai = new FakeAiProvider().respond('structure_job', () => OUTPUT);
  structure = new StructureJob({
    jobs: new DrizzleJobRepository(t.db.db),
    consents: t.consents,
    ai,
    prompt: structureJobV1,
    generations: new DrizzleAiGenerationLog(t.db.db, t.cipher),
    audit: t.audit,
  });
}, 180_000);

afterAll(async () => t?.stop());
beforeEach(() => {
  t.jobQueue.jobs.length = 0;
});

async function userWithAi(email: string) {
  const cookie = await t.signUp(email);
  await t.call(cookie, 'PUT', '/v1/me/consents/ai_processing', { granted: true });
  return cookie;
}

const importJob = (cookie: string, body: Record<string, unknown> = { text: TEXT }) =>
  t.call(cookie, 'POST', '/v1/jobs/import', body);

async function processQueue() {
  for (const job of t.jobQueue.jobs.splice(0)) await structure.run(job, { isLastAttempt: true });
}

describe('importação de vaga', () => {
  it('exige o consentimento de IA', async () => {
    const cookie = await t.signUp('sem-ia-vaga@example.com');
    const res = await importJob(cookie);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect((await t.call(cookie, 'GET', '/v1/jobs')).json()).toEqual([]);
  });

  it('rejeita texto curto e link inválido', async () => {
    const cookie = await userWithAi('invalida@example.com');
    expect((await importJob(cookie, { text: 'curto' })).statusCode).toBe(400);
    expect(
      (await importJob(cookie, { text: TEXT, applyUrl: 'http://localhost:3000' })).statusCode,
    ).toBe(400);
  });

  it('estrutura a vaga, descarta o que não está no texto e enfileira só IDs', async () => {
    const cookie = await userWithAi('estrutura@example.com');
    const res = await importJob(cookie, {
      text: TEXT,
      applyUrl: 'https://www.linkedin.com/jobs/view/123',
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('structuring');
    expect(Object.keys(t.jobQueue.jobs[0]!).sort()).toEqual(['jobId', 'userId']);

    ai.calls.length = 0;
    await processQueue();
    expect(String(ai.calls[0]?.promptInput.jobText)).not.toContain('rh@empresa.example');

    const job = (await t.call(cookie, 'GET', `/v1/jobs/${res.json().id}`)).json();
    expect(job).toMatchObject({
      status: 'ready',
      source: 'manual',
      company: 'Empresa Fictícia',
      seniority: 'senior',
      remotePolicy: 'remote',
      salaryText: 'R$ 18.000 a R$ 24.000',
      applyUrl: 'https://www.linkedin.com/jobs/view/123',
      mustHave: ['5 anos com React', 'TypeScript avançado'],
      niceToHave: ['GraphQL'],
    });

    const { rows } = await t.db.pool.query(
      "SELECT prompt_id, prompt_version, validation FROM ai_generations WHERE task = 'structure_job'",
    );
    expect(rows.at(-1)).toMatchObject({
      prompt_id: 'structure_job',
      prompt_version: 1,
      validation: { discardedRequirements: 1 },
    });
  });

  it('o mesmo texto não duplica a vaga', async () => {
    const cookie = await userWithAi('duplica@example.com');
    const first = await importJob(cookie);
    await processQueue();
    const second = await importJob(cookie, { text: TEXT.toUpperCase() });
    expect(second.json().id).toBe(first.json().id);
    expect(t.jobQueue.jobs).toEqual([]);
    expect((await t.call(cookie, 'GET', '/v1/jobs')).json()).toHaveLength(1);
  });

  it('a mesma vaga importada por duas pessoas fica separada', async () => {
    const a = await userWithAi('vaga-a@example.com');
    const b = await userWithAi('vaga-b@example.com');
    const ja = (await importJob(a)).json();
    const jb = (await importJob(b)).json();
    expect(ja.id).not.toBe(jb.id);
  });

  it('outro usuário não lê nem apaga a vaga (404)', async () => {
    const owner = await userWithAi('dono-vaga@example.com');
    const job = (await importJob(owner)).json();
    const other = await userWithAi('outro-vaga@example.com');
    expect((await t.call(other, 'GET', '/v1/jobs')).json()).toEqual([]);
    expect((await t.call(other, 'GET', `/v1/jobs/${job.id}`)).statusCode).toBe(404);
    expect((await t.call(other, 'DELETE', `/v1/jobs/${job.id}`)).statusCode).toBe(404);
  });

  it('revogar o consentimento antes do processamento impede a chamada à IA', async () => {
    const cookie = await userWithAi('revoga-vaga@example.com');
    const job = (await importJob(cookie)).json();
    await t.call(cookie, 'PUT', '/v1/me/consents/ai_processing', { granted: false });
    ai.calls.length = 0;
    await processQueue();
    expect(ai.calls).toHaveLength(0);
    expect((await t.call(cookie, 'GET', `/v1/jobs/${job.id}`)).json()).toMatchObject({
      status: 'failed',
      failureCode: 'consent_revoked',
    });
  });

  it('apaga a vaga', async () => {
    const cookie = await userWithAi('apaga-vaga@example.com');
    const job = (await importJob(cookie)).json();
    expect((await t.call(cookie, 'DELETE', `/v1/jobs/${job.id}`)).statusCode).toBe(204);
    expect((await t.call(cookie, 'GET', `/v1/jobs/${job.id}`)).statusCode).toBe(404);
  });

  it('a auditoria não guarda o conteúdo da vaga', async () => {
    const { rows } = await t.db.pool.query(
      "SELECT metadata::text AS m FROM audit_logs WHERE action LIKE 'job.%'",
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.m).not.toContain('Empresa Fictícia');
  });
});
