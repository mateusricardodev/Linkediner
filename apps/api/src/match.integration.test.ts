import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleJobRepository, jobDedupeHash, type JobFields } from '@linkediner/core/jobs';
import { DrizzleFactRepository } from '@linkediner/core/profile';
import { startTestApp } from './testing/app';

// Dados fictícios. A compatibilidade não usa IA.
let t: Awaited<ReturnType<typeof startTestApp>>;
let jobs: DrizzleJobRepository;
let facts: DrizzleFactRepository;

const FIELDS: JobFields = {
  title: 'Senior Frontend Engineer',
  company: 'Empresa Fictícia',
  location: 'Remoto',
  employmentType: null,
  salaryText: null,
  remotePolicy: 'remote',
  seniority: 'senior',
  mustHave: ['React', 'Vue'],
  niceToHave: ['GraphQL'],
};

beforeAll(async () => {
  t = await startTestApp();
  jobs = new DrizzleJobRepository(t.db.db);
  facts = new DrizzleFactRepository(t.db.db);
}, 180_000);

afterAll(async () => t?.stop());

const userIdOf = async (cookie: string) =>
  (await t.call(cookie, 'GET', '/v1/me')).json().user.id as string;

async function jobFor(cookie: string, fields: JobFields | null = FIELDS) {
  const userId = await userIdOf(cookie);
  const id = crypto.randomUUID();
  await jobs.insert(userId, {
    id,
    rawText: `Vaga fictícia ${id}`,
    applyUrl: null,
    dedupeHash: jobDedupeHash(id),
  });
  if (fields) await jobs.saveFields(userId, id, fields);
  return { id, userId };
}

const getMatch = (cookie: string, id: string, query = '') =>
  t.call(cookie, 'GET', `/v1/jobs/${id}/match${query}`);

describe('compatibilidade', () => {
  it('funciona sem o consentimento de IA, porque nada vai ao provedor', async () => {
    const cookie = await t.signUp('match-sem-ia@example.com');
    const { id, userId } = await jobFor(cookie);
    await facts.addConfirmed(userId, { type: 'skill', data: { name: 'React' } });

    const res = await getMatch(cookie, id);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(
      body.requirements.map((r: { text: string; status: string }) => [r.text, r.status]),
    ).toEqual([
      ['React', 'met'],
      ['Vue', 'missing'],
      ['GraphQL', 'missing'],
    ]);
    expect(body.rubricVersion).toBe('v1');
    expect(body.disclaimer).toMatch(/Não indica chance de contratação/);
    // Obrigatórios 30/60 e desejáveis 0/15: 40 de 100, proporcional aos critérios com dados.
    expect(body.score).toBe(40);
  });

  it('usa o objetivo ativo, e sobe quando o perfil melhora', async () => {
    const cookie = await t.signUp('match-objetivo@example.com');
    const { id, userId } = await jobFor(cookie);
    await t.call(cookie, 'POST', '/v1/career-goals', {
      title: 'Frontend remoto',
      seniority: 'senior',
    });

    const before = (await getMatch(cookie, id)).json();
    expect(before.careerGoalId).toBeTruthy();
    expect(before.factors.map((f: { criterion: string }) => f.criterion)).toEqual([
      'must_have',
      'nice_to_have',
      'seniority',
      'work_model',
    ]);

    for (const name of ['React', 'Vue', 'GraphQL']) {
      await facts.addConfirmed(userId, { type: 'skill', data: { name } });
    }
    expect((await getMatch(cookie, id)).json().score).toBe(100);

    const { rows } = await t.db.pool.query(
      'SELECT count(*)::int AS n FROM job_matches WHERE job_id = $1',
      [id],
    );
    expect(rows[0].n).toBe(1);
  });

  it('aceita escolher o objetivo e recusa objetivo de outra pessoa', async () => {
    const cookie = await t.signUp('match-escolhe@example.com');
    const { id } = await jobFor(cookie);
    const goal = await t.call(cookie, 'POST', '/v1/career-goals', {
      title: 'Objetivo inativo',
      seniority: 'junior',
      isActive: false,
    });
    const chosen = await getMatch(cookie, id, `?goalId=${goal.json().id}`);
    expect(chosen.json().careerGoalId).toBe(goal.json().id);

    const other = await t.signUp('match-outro-objetivo@example.com');
    const otherGoal = await t.call(other, 'POST', '/v1/career-goals', {
      title: 'De outra pessoa',
      seniority: 'senior',
    });
    expect((await getMatch(cookie, id, `?goalId=${otherGoal.json().id}`)).statusCode).toBe(404);
  });

  it('vaga sem requisitos não recebe número', async () => {
    const cookie = await t.signUp('match-sem-requisitos@example.com');
    const { id } = await jobFor(cookie, { ...FIELDS, mustHave: [], niceToHave: [] });
    expect((await getMatch(cookie, id)).json().score).toBeNull();
  });

  it('vaga ainda não analisada devolve 409', async () => {
    const cookie = await t.signUp('match-pendente@example.com');
    const { id } = await jobFor(cookie, null);
    expect((await getMatch(cookie, id)).statusCode).toBe(409);
  });

  it('outro usuário não vê a compatibilidade (404)', async () => {
    const cookie = await t.signUp('match-dono@example.com');
    const { id } = await jobFor(cookie);
    const other = await t.signUp('match-outro@example.com');
    expect((await getMatch(other, id)).statusCode).toBe(404);
  });

  it('apagar a vaga remove o cálculo', async () => {
    const cookie = await t.signUp('match-apaga@example.com');
    const { id } = await jobFor(cookie);
    await getMatch(cookie, id);
    await t.call(cookie, 'DELETE', `/v1/jobs/${id}`);
    const { rows } = await t.db.pool.query(
      'SELECT count(*)::int AS n FROM job_matches WHERE job_id = $1',
      [id],
    );
    expect(rows[0].n).toBe(0);
  });
});
