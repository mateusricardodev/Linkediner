import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  coverLetterV2,
  DrizzleAiGenerationLog,
  FakeAiProvider,
  formAnswersV2,
  tailorResumeV2,
} from '@linkediner/core/ai';
import {
  DrizzleApplicationRepository,
  DrizzleMaterialRepository,
  GenerateMaterial,
} from '@linkediner/core/applications';
import { DrizzleJobRepository, jobDedupeHash } from '@linkediner/core/jobs';
import { DrizzleFactRepository } from '@linkediner/core/profile';
import { DrizzleResumeRepository } from '@linkediner/core/resumes';
import { startTestApp, WEB } from './testing/app';

// Dados fictícios. Nenhuma chamada real de IA acontece aqui.
let t: Awaited<ReturnType<typeof startTestApp>>;
let ai: FakeAiProvider;
let generate: GenerateMaterial;

const experienceIdOf = (req: { promptInput: Record<string, unknown> }) =>
  (req.promptInput.facts as { id: string; type: string }[]).find((f) => f.type === 'experience')!
    .id;

beforeAll(async () => {
  t = await startTestApp();
  const db = t.db.db;
  ai = new FakeAiProvider()
    .respond('generate_resume', (req) => {
      const id = experienceIdOf(req);
      return {
        summary: [],
        bullets: [
          { text: 'Reduzi o build em 40%', factIds: [id], experienceFactId: id },
          { text: 'Reduzi custos em 90%', factIds: [id], experienceFactId: id },
        ],
      };
    })
    .respond('generate_cover_letter', (req) => ({
      paragraphs: [
        { text: 'Quero atuar na Empresa Fictícia.', factIds: [experienceIdOf(req)] },
        { text: 'Domino GraphQL.', factIds: [experienceIdOf(req)] },
      ],
    }))
    .respond('answer_form', (req) => ({
      answers: [
        { questionIndex: 0, text: 'Reduzi o build em 40%.', factIds: [experienceIdOf(req)] },
      ],
    }));
  generate = new GenerateMaterial({
    materials: new DrizzleMaterialRepository(db, t.cipher),
    applications: new DrizzleApplicationRepository(db, t.cipher),
    jobs: new DrizzleJobRepository(db),
    resumes: new DrizzleResumeRepository(db, t.cipher),
    facts: new DrizzleFactRepository(db, t.cipher),
    consents: t.consents,
    ai,
    prompts: { resume: tailorResumeV2, cover_letter: coverLetterV2, form_answers: formAnswersV2 },
    generations: new DrizzleAiGenerationLog(db, t.cipher),
    quota: t.quota,
    audit: t.audit,
  });
}, 180_000);

afterAll(async () => t?.stop());
beforeEach(() => {
  t.materialQueue.jobs.length = 0;
});

async function setup(email: string, { consent = true, facts = true } = {}) {
  const cookie = await t.signUp(email);
  const userId = (await t.call(cookie, 'GET', '/v1/me')).json().user.id as string;
  if (consent) await t.call(cookie, 'PUT', '/v1/me/consents/ai_processing', { granted: true });
  if (facts) {
    await new DrizzleFactRepository(t.db.db, t.cipher).addConfirmed(userId, {
      type: 'experience',
      data: {
        company: 'Nubank',
        title: 'Engenheira',
        startDate: null,
        endDate: null,
        location: null,
        description: 'Reduzi o build em 40%',
      },
    });
  }
  const jobs = new DrizzleJobRepository(t.db.db);
  const jobId = crypto.randomUUID();
  await jobs.insert(userId, {
    id: jobId,
    rawText: `Vaga fictícia ${jobId}`,
    applyUrl: null,
    dedupeHash: jobDedupeHash(jobId),
  });
  await jobs.saveFields(userId, jobId, {
    title: 'Frontend Sênior',
    company: 'Empresa Fictícia',
    location: null,
    employmentType: null,
    salaryText: null,
    remotePolicy: 'remote',
    seniority: null,
    mustHave: ['React', 'GraphQL'],
    niceToHave: [],
  });
  const id = (await t.call(cookie, 'POST', '/v1/applications', { jobId })).json().id as string;
  return { cookie, id, jobId, userId };
}

// A rota aceita 10 pedidos por minuto de cada IP. Cada pedido usa um IP próprio para os testes não
// esgotarem o limite entre si. O limite tem um teste só dele.
let requests = 0;
const requestFrom = (
  remoteAddress: string,
  cookie: string,
  id: string,
  body: Record<string, unknown>,
) =>
  t.app.inject({
    method: 'POST',
    url: `/v1/applications/${id}/materials`,
    headers: { cookie, origin: WEB, 'content-type': 'application/json' },
    payload: body,
    remoteAddress,
  });
const requestMaterial = (cookie: string, id: string, body: Record<string, unknown>) =>
  requestFrom(`10.0.0.${++requests}`, cookie, id, body);
const materialsOf = async (cookie: string, id: string) =>
  (await t.call(cookie, 'GET', `/v1/applications/${id}/materials`)).json();
const stateOf = async (cookie: string, id: string) =>
  (await t.call(cookie, 'GET', `/v1/applications/${id}`)).json().application.state as string;

async function runQueue() {
  for (const job of t.materialQueue.jobs.splice(0)) {
    await generate.run(job, { isLastAttempt: true });
  }
}

describe('material por vaga', () => {
  it('limita os pedidos por minuto de cada IP', async () => {
    const { cookie, id } = await setup('mat-limite@example.com');
    // Sem perguntas, o pedido é recusado na validação: nada é gerado nem vai para a fila.
    for (let i = 0; i < 10; i++) {
      const res = await requestFrom('10.0.1.1', cookie, id, { kind: 'form_answers' });
      expect(res.statusCode).toBe(400);
    }
    const blocked = await requestFrom('10.0.1.1', cookie, id, { kind: 'form_answers' });
    expect(blocked.statusCode).toBe(429);
    const otherIp = await requestFrom('10.0.1.2', cookie, id, { kind: 'form_answers' });
    expect(otherIp.statusCode).toBe(400);
  });

  it('exige consentimento de IA e fatos comprovados', async () => {
    const semIa = await setup('mat-sem-ia@example.com', { consent: false });
    expect((await requestMaterial(semIa.cookie, semIa.id, { kind: 'resume' })).statusCode).toBe(
      403,
    );
    const semFatos = await setup('mat-sem-fatos@example.com', { facts: false });
    expect(
      (await requestMaterial(semFatos.cookie, semFatos.id, { kind: 'resume' })).statusCode,
    ).toBe(409);
    expect(t.materialQueue.jobs).toEqual([]);
    expect(await stateOf(semIa.cookie, semIa.id)).toBe('saved');
  });

  it('gera o currículo adaptado e leva a candidatura à revisão, enfileirando só IDs', async () => {
    const { cookie, id } = await setup('mat-curriculo@example.com');
    const res = await requestMaterial(cookie, id, { kind: 'resume' });
    expect(res.statusCode).toBe(202);
    expect(await stateOf(cookie, id)).toBe('analyzing');
    expect(Object.keys(t.materialQueue.jobs[0]!).sort()).toEqual([
      'applicationId',
      'materialId',
      'usageId',
      'userId',
    ]);
    await runQueue();
    expect(await stateOf(cookie, id)).toBe('in_review');
    const [material] = await materialsOf(cookie, id);
    expect(material).toMatchObject({ kind: 'resume', status: 'ready' });
    expect(material.content.experiences[0].company).toBe('Nubank');
    expect(
      material.content.experiences[0].bullets.map((b: { status: string }) => b.status),
    ).toEqual(['grounded', 'suggested']);
  });

  it('a IA recebe a vaga e os fatos, mas não o texto bruto nem trechos de documentos', async () => {
    const { cookie, id } = await setup('mat-entrada@example.com');
    await requestMaterial(cookie, id, { kind: 'cover_letter' });
    ai.calls.length = 0;
    await runQueue();
    const input = JSON.stringify(ai.calls[0]?.promptInput);
    expect(input).toContain('GraphQL');
    expect(input).not.toContain('Vaga fictícia');
    expect(input).not.toContain('sourceSpan');
  });

  it('na carta, afirmar um requisito da vaga sem comprovação vira sugestão', async () => {
    const { cookie, id } = await setup('mat-carta@example.com');
    await requestMaterial(cookie, id, { kind: 'cover_letter' });
    await runQueue();
    const [material] = await materialsOf(cookie, id);
    expect(material.content.paragraphs.map((p: { status: string }) => p.status)).toEqual([
      'grounded',
      'suggested',
    ]);
    const { rows } = await t.db.pool.query(
      "SELECT prompt_id, prompt_version FROM ai_generations WHERE task = 'generate_cover_letter'",
    );
    expect(rows.at(-1)).toEqual({ prompt_id: 'cover_letter', prompt_version: 2 });
  });

  it('formulário: exige perguntas, e pergunta sem fatos fica sem resposta', async () => {
    const { cookie, id } = await setup('mat-form@example.com');
    expect((await requestMaterial(cookie, id, { kind: 'form_answers' })).statusCode).toBe(400);
    await requestMaterial(cookie, id, {
      kind: 'form_answers',
      questions: ['Qual seu principal resultado?', 'Qual sua pretensão salarial?'],
    });
    await runQueue();
    const [material] = await materialsOf(cookie, id);
    expect(material.content.answers[0].answer.status).toBe('grounded');
    expect(material.content.answers[1].answer).toBeNull();
  });

  it('gerar de novo substitui o material do mesmo tipo', async () => {
    const { cookie, id } = await setup('mat-regera@example.com');
    await requestMaterial(cookie, id, { kind: 'cover_letter' });
    await runQueue();
    await requestMaterial(cookie, id, { kind: 'cover_letter' });
    const list = await materialsOf(cookie, id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'generating', content: null });
    await runQueue();
    expect((await materialsOf(cookie, id))[0].status).toBe('ready');
  });
});

describe('aprovação com material', () => {
  async function inReview(email: string) {
    const s = await setup(email);
    await requestMaterial(s.cookie, s.id, { kind: 'resume' });
    await runQueue();
    const [material] = await materialsOf(s.cookie, s.id);
    return { ...s, material, suggestion: material.content.experiences[0].bullets[1] };
  }
  const decide = (cookie: string, id: string, mid: string, item: string, body: object) =>
    t.call(cookie, 'PATCH', `/v1/applications/${id}/materials/${mid}/items/${item}`, body);

  it('não segue para aprovação com sugestão pendente', async () => {
    const { cookie, id } = await inReview('mat-pendente@example.com');
    const res = await t.call(cookie, 'POST', `/v1/applications/${id}/submit-for-approval`);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ details: { pendingSuggestions: 1 } });
  });

  it('remove a sugestão, aprova sem currículo geral e usa o adaptado', async () => {
    const { cookie, id, material, suggestion } = await inReview('mat-aprova@example.com');
    const removed = await decide(cookie, id, material.id, suggestion.id, { action: 'remove' });
    expect(removed.statusCode).toBe(200);
    await t.call(cookie, 'POST', `/v1/applications/${id}/submit-for-approval`);
    const approved = await t.call(cookie, 'POST', `/v1/applications/${id}/approve`);
    expect(approved.json().state).toBe('manual_action_required');

    const file = await t.call(cookie, 'GET', `/v1/applications/${id}/resume?format=pdf`);
    expect(file.statusCode).toBe(200);

    // Depois de aprovado, o material fica congelado.
    const late = await decide(
      cookie,
      id,
      material.id,
      material.content.experiences[0].bullets[0].id,
      {
        action: 'remove',
      },
    );
    expect(late.statusCode).toBe(409);
    expect((await requestMaterial(cookie, id, { kind: 'resume' })).statusCode).toBe(409);
  });

  it('confirmar sugestão do currículo vira fato. Na carta, não', async () => {
    const r = await inReview('mat-fato@example.com');
    await decide(r.cookie, r.id, r.material.id, r.suggestion.id, { action: 'confirm' });
    const facts = (await t.call(r.cookie, 'GET', '/v1/profile/facts')).json();
    expect(facts.filter((f: { type: string }) => f.type === 'achievement')).toHaveLength(1);

    await requestMaterial(r.cookie, r.id, { kind: 'cover_letter' });
    await runQueue();
    const letter = (await materialsOf(r.cookie, r.id)).find(
      (m: { kind: string }) => m.kind === 'cover_letter',
    );
    await decide(r.cookie, r.id, letter.id, letter.content.paragraphs[1].id, { action: 'confirm' });
    const after = (await t.call(r.cookie, 'GET', '/v1/profile/facts')).json();
    expect(after.filter((f: { type: string }) => f.type === 'achievement')).toHaveLength(1);
  });

  it('outro usuário não vê nem altera o material (404)', async () => {
    const { id, material, suggestion } = await inReview('mat-dono@example.com');
    const other = await t.signUp('mat-outro@example.com');
    expect((await t.call(other, 'GET', `/v1/applications/${id}/materials`)).statusCode).toBe(404);
    expect(
      (await decide(other, id, material.id, suggestion.id, { action: 'remove' })).statusCode,
    ).toBe(404);
  });

  it('material de outra candidatura do mesmo usuário é recusado', async () => {
    const a = await inReview('mat-cruzado@example.com');
    const jobs = new DrizzleJobRepository(t.db.db);
    const jobId = crypto.randomUUID();
    await jobs.insert(a.userId, {
      id: jobId,
      rawText: `Outra vaga ${jobId}`,
      applyUrl: null,
      dedupeHash: jobDedupeHash(jobId),
    });
    await jobs.saveFields(a.userId, jobId, {
      title: null,
      company: null,
      location: null,
      employmentType: null,
      salaryText: null,
      remotePolicy: 'remote',
      seniority: null,
      mustHave: [],
      niceToHave: [],
    });
    const other = (await t.call(a.cookie, 'POST', '/v1/applications', { jobId })).json()
      .id as string;
    await requestMaterial(a.cookie, other, { kind: 'cover_letter' });
    await runQueue();
    const res = await decide(a.cookie, other, a.material.id, a.suggestion.id, { action: 'remove' });
    expect(res.statusCode).toBe(404);
  });

  it('revogar o consentimento impede a IA e devolve a candidatura à revisão', async () => {
    const { cookie, id } = await setup('mat-revoga@example.com');
    await requestMaterial(cookie, id, { kind: 'resume' });
    await t.call(cookie, 'PUT', '/v1/me/consents/ai_processing', { granted: false });
    ai.calls.length = 0;
    await runQueue();
    expect(ai.calls).toHaveLength(0);
    expect((await materialsOf(cookie, id))[0]).toMatchObject({
      status: 'failed',
      failureCode: 'consent_revoked',
    });
    expect(await stateOf(cookie, id)).toBe('in_review');
  });
});

describe('recomendações', () => {
  it('vaga com candidatura enviada sai da lista, e a apenas salva continua', async () => {
    const { cookie, id, jobId } = await setup('mat-enviada@example.com');
    const before = (await t.call(cookie, 'GET', '/v1/jobs/recommendations')).json();
    expect(before.items.map((i: { job: { id: string } }) => i.job.id)).toContain(jobId);

    await requestMaterial(cookie, id, { kind: 'resume' });
    await runQueue();
    const [resume] = await materialsOf(cookie, id);
    const suggestion = resume.content.experiences[0].bullets[1].id as string;
    await t.call(
      cookie,
      'PATCH',
      `/v1/applications/${id}/materials/${resume.id}/items/${suggestion}`,
      {
        action: 'remove',
      },
    );
    await t.call(cookie, 'POST', `/v1/applications/${id}/submit-for-approval`);
    await t.call(cookie, 'POST', `/v1/applications/${id}/approve`);

    // Aprovar ainda não é enviar: a vaga só sai da lista quando a candidatura é enviada.
    const approved = (await t.call(cookie, 'GET', '/v1/jobs/recommendations')).json();
    expect(approved.items.map((i: { job: { id: string } }) => i.job.id)).toContain(jobId);

    await t.call(cookie, 'POST', `/v1/applications/${id}/manual-complete`);

    const after = (await t.call(cookie, 'GET', '/v1/jobs/recommendations')).json();
    expect(after.items.map((i: { job: { id: string } }) => i.job.id)).not.toContain(jobId);
    expect(after.hidden).toBe(1);
  });
});

describe('aprender com as correções do material', () => {
  it('gerar de novo usa o que a pessoa corrigiu, e a carta de outra vaga também aprende', async () => {
    const { cookie, id, userId } = await setup('mat-correcoes@example.com');
    await requestMaterial(cookie, id, { kind: 'cover_letter' });
    await runQueue();
    const [letter] = await materialsOf(cookie, id);
    const [first, second] = letter.content.paragraphs;
    const base = `/v1/applications/${id}/materials/${letter.id}/items`;
    await t.call(cookie, 'PATCH', `${base}/${first.id}`, {
      action: 'confirm',
      text: 'Gostaria de contribuir com a Empresa Fictícia.',
    });
    await t.call(cookie, 'PATCH', `${base}/${second.id}`, { action: 'remove' });

    const expected = {
      edited: [
        {
          before: 'Quero atuar na Empresa Fictícia.',
          after: 'Gostaria de contribuir com a Empresa Fictícia.',
        },
      ],
      removed: ['Domino GraphQL.'],
    };

    // Gerar de novo a mesma carta: o conteúdo é limpo, mas as correções passam adiante.
    await requestMaterial(cookie, id, { kind: 'cover_letter' });
    const { rows } = await t.db.pool.query(
      'SELECT corrections::text AS c FROM application_materials WHERE id = $1',
      [letter.id],
    );
    expect(rows[0].c).not.toContain('Gostaria de contribuir');
    ai.calls.length = 0;
    await runQueue();
    expect(ai.calls[0]?.promptInput.corrections).toEqual(expected);

    // Outra candidatura da mesma pessoa: a carta nova também aprende.
    const jobs = new DrizzleJobRepository(t.db.db);
    const jobId = crypto.randomUUID();
    await jobs.insert(userId, {
      id: jobId,
      rawText: `Outra vaga fictícia ${jobId}`,
      applyUrl: null,
      dedupeHash: jobDedupeHash(jobId),
    });
    await jobs.saveFields(userId, jobId, {
      title: 'Backend Pleno',
      company: 'Outra Empresa Fictícia',
      location: null,
      employmentType: null,
      salaryText: null,
      remotePolicy: 'remote',
      seniority: null,
      mustHave: ['Go'],
      niceToHave: [],
    });
    const other = (await t.call(cookie, 'POST', '/v1/applications', { jobId })).json().id as string;
    await requestMaterial(cookie, other, { kind: 'cover_letter' });
    ai.calls.length = 0;
    await runQueue();
    expect(ai.calls[0]?.promptInput.corrections).toEqual(expected);
  });
});
