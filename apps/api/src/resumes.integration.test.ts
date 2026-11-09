import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DrizzleAiGenerationLog, FakeAiProvider, generateResumeV3 } from '@linkediner/core/ai';
import { DrizzleJobRepository } from '@linkediner/core/jobs';
import { DrizzleFactRepository } from '@linkediner/core/profile';
import {
  DrizzleResumeRepository,
  GenerateResume,
  type ResumeOutput,
} from '@linkediner/core/resumes';
import { startTestApp } from './testing/app';

// Dados fictícios. Nenhuma chamada real de IA acontece aqui.
let t: Awaited<ReturnType<typeof startTestApp>>;
let ai: FakeAiProvider;
let generate: GenerateResume;
let facts: DrizzleFactRepository;

/** IA simulada: uma frase comprovada e uma com número inventado, citando a experiência recebida. */
const respond = (req: { promptInput: Record<string, unknown> }): ResumeOutput => {
  const list = req.promptInput.facts as { id: string; type: string }[];
  const experience = list.find((f) => f.type === 'experience')!;
  return {
    summary: [{ text: 'Engenheira com foco em frontend', factIds: [experience.id] }],
    bullets: [
      {
        text: 'Reduzi o tempo de build em 40%',
        factIds: [experience.id],
        experienceFactId: experience.id,
      },
      {
        text: 'Reduzi custos em 90%',
        factIds: [experience.id],
        experienceFactId: experience.id,
      },
    ],
  };
};

beforeAll(async () => {
  t = await startTestApp();
  const db = t.db.db;
  facts = new DrizzleFactRepository(db, t.cipher);
  ai = new FakeAiProvider().respond('generate_resume', respond);
  generate = new GenerateResume({
    resumes: new DrizzleResumeRepository(db, t.cipher),
    facts,
    jobs: new DrizzleJobRepository(db),
    consents: t.consents,
    ai,
    prompt: generateResumeV3,
    generations: new DrizzleAiGenerationLog(db, t.cipher),
    quota: t.quota,
    audit: t.audit,
  });
}, 180_000);

afterAll(async () => t?.stop());
beforeEach(() => {
  t.resumeQueue.jobs.length = 0;
});

const userIdOf = async (cookie: string) =>
  (await t.call(cookie, 'GET', '/v1/me')).json().user.id as string;

async function userWithFacts(email: string, { consent = true } = {}) {
  const cookie = await t.signUp(email);
  if (consent) {
    await t.call(cookie, 'PUT', '/v1/me/consents/ai_processing', { granted: true });
  }
  await facts.addConfirmed(await userIdOf(cookie), {
    type: 'experience',
    data: {
      company: 'Nubank',
      title: 'Engenheira Frontend',
      startDate: '2021',
      endDate: null,
      location: null,
      description: 'Reduzi o tempo de build em 40%',
    },
  });
  return cookie;
}

async function generated(cookie: string) {
  const res = await t.call(cookie, 'POST', '/v1/resumes');
  expect(res.statusCode).toBe(202);
  for (const job of t.resumeQueue.jobs.splice(0)) {
    await generate.run(job, { isLastAttempt: true });
  }
  return (await t.call(cookie, 'GET', `/v1/resumes/${res.json().id}`)).json();
}

describe('currículo melhorado', () => {
  it('exige o consentimento de IA', async () => {
    const cookie = await userWithFacts('sem-ia@example.com', { consent: false });
    const res = await t.call(cookie, 'POST', '/v1/resumes');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'CONSENT_REQUIRED' });
  });

  it('exige ao menos um fato comprovado', async () => {
    const cookie = await t.signUp('sem-fatos@example.com');
    await t.call(cookie, 'PUT', '/v1/me/consents/ai_processing', { granted: true });
    expect((await t.call(cookie, 'POST', '/v1/resumes')).statusCode).toBe(409);
  });

  it('copia os dados dos fatos e separa frases comprovadas de sugestões', async () => {
    const resume = await generated(await userWithFacts('gera@example.com'));
    expect(resume.status).toBe('draft');
    const experience = resume.content.experiences[0];
    expect(experience).toMatchObject({ company: 'Nubank', title: 'Engenheira Frontend' });
    expect(experience.bullets.map((b: { status: string }) => b.status)).toEqual([
      'grounded',
      'suggested',
    ]);

    const { rows } = await t.db.pool.query(
      "SELECT prompt_id, prompt_version, validation FROM ai_generations WHERE task = 'generate_resume'",
    );
    expect(rows.at(-1)).toMatchObject({
      prompt_id: 'generate_resume',
      prompt_version: 3,
      validation: { suggested: 1 },
    });
  });

  it('confirmar uma sugestão vira fato do usuário, e remover não', async () => {
    const cookie = await userWithFacts('decide@example.com');
    const resume = await generated(cookie);
    const suggestion = resume.content.experiences[0].bullets[1];

    const url = `/v1/resumes/${resume.id}/items/${suggestion.id}`;
    const confirmed = await t.call(cookie, 'PATCH', url, { action: 'confirm' });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().content.experiences[0].bullets[1]).toMatchObject({
      status: 'user_confirmed',
    });
    const list = (await t.call(cookie, 'GET', '/v1/profile/facts')).json();
    expect(list.filter((f: { type: string }) => f.type === 'achievement')).toHaveLength(1);

    const removed = await t.call(cookie, 'PATCH', url, { action: 'remove' });
    expect(removed.json().content.experiences[0].bullets[1].status).toBe('removed');
  });

  it('outro usuário não lê, altera nem apaga o currículo (404)', async () => {
    const cookie = await userWithFacts('dono@example.com');
    const resume = await generated(cookie);
    const other = await t.signUp('outro-curriculo@example.com');
    const item = resume.content.experiences[0].bullets[0].id;
    expect((await t.call(other, 'GET', '/v1/resumes')).json()).toEqual([]);
    expect((await t.call(other, 'GET', `/v1/resumes/${resume.id}`)).statusCode).toBe(404);
    expect(
      (
        await t.call(other, 'PATCH', `/v1/resumes/${resume.id}/items/${item}`, {
          action: 'remove',
        })
      ).statusCode,
    ).toBe(404);
    expect((await t.call(other, 'DELETE', `/v1/resumes/${resume.id}`)).statusCode).toBe(404);
  });

  it('apaga o currículo', async () => {
    const cookie = await userWithFacts('apaga-curriculo@example.com');
    const resume = await generated(cookie);
    expect((await t.call(cookie, 'DELETE', `/v1/resumes/${resume.id}`)).statusCode).toBe(204);
    expect((await t.call(cookie, 'GET', `/v1/resumes/${resume.id}`)).statusCode).toBe(404);
  });
});

describe('conferência ATS e correções', () => {
  it('confere o currículo e aponta melhorias pontuais nas frases', async () => {
    const cookie = await userWithFacts('ats@example.com');
    const resume = await generated(cookie);
    const res = await t.call(cookie, 'GET', `/v1/resumes/${resume.id}/ats`);
    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.total).toBeGreaterThan(0);
    const failing = report.checks.filter((c: { ok: boolean }) => !c.ok);
    expect(failing.map((c: { id: string }) => c.id)).toEqual(
      expect.arrayContaining(['headline', 'linkedin', 'skills']),
    );
    expect(failing.every((c: { recommendation: string | null }) => c.recommendation)).toBe(true);

    const other = await t.signUp('ats-outra@example.com');
    expect((await t.call(other, 'GET', `/v1/resumes/${resume.id}/ats`)).statusCode).toBe(404);
  });

  it('a correção guarda o texto gerado, cifrado, e ensina a próxima geração', async () => {
    const cookie = await userWithFacts('aprende@example.com');
    const first = await generated(cookie);
    const [grounded, suggestion] = first.content.experiences[0].bullets;
    const base = `/v1/resumes/${first.id}/items`;
    await t.call(cookie, 'PATCH', `${base}/${grounded.id}`, {
      action: 'confirm',
      text: 'Reduzi o tempo de build do app em 40% com cache',
    });
    await t.call(cookie, 'PATCH', `${base}/${suggestion.id}`, { action: 'remove' });

    // O texto original não aparece em claro no banco.
    const { rows } = await t.db.pool.query('SELECT content::text AS c FROM resumes WHERE id = $1', [
      first.id,
    ]);
    expect(rows[0].c).not.toContain('Reduzi o tempo de build em 40%');

    const calls = ai.calls.length;
    await generated(cookie);
    expect(ai.calls[calls]?.promptInput.corrections).toEqual({
      edited: [
        {
          before: 'Reduzi o tempo de build em 40%',
          after: 'Reduzi o tempo de build do app em 40% com cache',
        },
      ],
      removed: ['Reduzi custos em 90%'],
    });
  });
});

describe('idioma e vaga', () => {
  // Outro endereço: a rota limita 10 pedidos por minuto, e os testes acima já usaram parte.
  let ip = 0;
  const request = (cookie: string, body?: Record<string, unknown>) =>
    t.app.inject({
      method: 'POST',
      url: '/v1/resumes',
      headers: {
        cookie,
        origin: 'http://localhost:3000',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { payload: body } : {}),
      remoteAddress: `10.0.9.${++ip}`,
    });

  it('pede um currículo em inglês, e sem corpo continua geral em português', async () => {
    const cookie = await userWithFacts('ingles@example.com');
    const en = await request(cookie, { language: 'en' });
    expect(en.statusCode).toBe(202);
    expect(en.json()).toMatchObject({ language: 'en', jobId: null });
    for (const job of t.resumeQueue.jobs.splice(0))
      await generate.run(job, { isLastAttempt: true });
    expect(ai.calls.at(-1)?.promptInput.language).toBe('en');

    const other = await userWithFacts('portugues@example.com');
    const pt = await request(other);
    expect(pt.json()).toMatchObject({ language: 'pt', jobId: null });
  });

  it('recusa idioma desconhecido e vaga que não é da pessoa', async () => {
    const cookie = await userWithFacts('vaga-alheia@example.com');
    expect((await request(cookie, { language: 'es' })).statusCode).toBe(400);
    const res = await request(cookie, {
      language: 'pt',
      jobId: '01960000-0000-7000-8000-0000000000aa',
    });
    expect(res.statusCode).toBe(404);
  });
});
