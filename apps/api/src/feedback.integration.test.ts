import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleJobRepository, jobDedupeHash, type JobFields } from '@linkediner/core/jobs';
import { DrizzleFactRepository } from '@linkediner/core/profile';
import { startTestApp } from './testing/app';

// Dados fictícios. Avaliações e recomendações não usam IA.
let t: Awaited<ReturnType<typeof startTestApp>>;
let jobs: DrizzleJobRepository;
let facts: DrizzleFactRepository;

const fields = (o: Partial<JobFields> = {}): JobFields => ({
  title: 'Vaga fictícia',
  company: 'Empresa A',
  location: null,
  employmentType: null,
  salaryText: null,
  remotePolicy: 'remote',
  seniority: null,
  mustHave: ['React'],
  niceToHave: [],
  ...o,
});

beforeAll(async () => {
  t = await startTestApp();
  jobs = new DrizzleJobRepository(t.db.db);
  facts = new DrizzleFactRepository(t.db.db);
}, 180_000);

afterAll(async () => t?.stop());

async function user(email: string) {
  const cookie = await t.signUp(email);
  const userId = (await t.call(cookie, 'GET', '/v1/me')).json().user.id as string;
  await facts.addConfirmed(userId, { type: 'skill', data: { name: 'React' } });
  return { cookie, userId };
}

async function jobFor(userId: string, o: Partial<JobFields> = {}) {
  const id = crypto.randomUUID();
  await jobs.insert(userId, {
    id,
    rawText: `Vaga fictícia ${id}`,
    applyUrl: null,
    dedupeHash: jobDedupeHash(id),
  });
  await jobs.saveFields(userId, id, fields(o));
  return id;
}

const rate = (cookie: string, id: string, reasons: string[]) =>
  t.call(cookie, 'PUT', `/v1/jobs/${id}/feedback`, { reasons });
const recommendations = async (cookie: string) =>
  (await t.call(cookie, 'GET', '/v1/jobs/recommendations')).json();
const idsOf = (body: { items: { job: { id: string } }[] }) => body.items.map((i) => i.job.id);

describe('feedback da vaga', () => {
  it('grava, substitui e limpa a avaliação', async () => {
    const { cookie, userId } = await user('fb-grava@example.com');
    const id = await jobFor(userId);
    expect((await rate(cookie, id, ['liked'])).json()).toEqual({ reasons: ['liked'] });
    await rate(cookie, id, ['more_like_this']);
    expect((await t.call(cookie, 'GET', `/v1/jobs/${id}/feedback`)).json()).toEqual({
      reasons: ['more_like_this'],
    });
    await rate(cookie, id, []);
    expect((await t.call(cookie, 'GET', `/v1/jobs/${id}/feedback`)).json()).toEqual({
      reasons: [],
    });
  });

  it('recusa motivo desconhecido e avaliação contraditória', async () => {
    const { cookie, userId } = await user('fb-invalido@example.com');
    const id = await jobFor(userId);
    expect((await rate(cookie, id, ['nao-existe'])).statusCode).toBe(400);
    expect((await rate(cookie, id, ['liked', 'disliked'])).statusCode).toBe(400);
  });

  it('outro usuário não avalia nem vê a avaliação (404)', async () => {
    const { userId } = await user('fb-dono@example.com');
    const id = await jobFor(userId);
    const other = await t.signUp('fb-outro@example.com');
    expect((await rate(other, id, ['liked'])).statusCode).toBe(404);
    expect((await t.call(other, 'GET', `/v1/jobs/${id}/feedback`)).statusCode).toBe(404);
    expect((await recommendations(other)).items).toEqual([]);
  });
});

describe('recomendações', () => {
  it('avaliações mudam a ordem e escondem vagas, sem mudar o score', async () => {
    const { cookie, userId } = await user('fb-ordem@example.com');
    const a = await jobFor(userId, { company: 'Empresa A', mustHave: ['React', 'Vue'] });
    const b = await jobFor(userId, { company: 'Empresa B', mustHave: ['React', 'Rust'] });
    const blocked1 = await jobFor(userId, { company: 'Empresa C' });
    const blocked2 = await jobFor(userId, { company: 'empresa c' });

    const before = await recommendations(cookie);
    expect(before.items).toHaveLength(4);
    expect(before.disclaimer).toMatch(/Não indica chance de contratação/);
    const scoreOf = (body: typeof before, id: string) =>
      body.items.find((i: { job: { id: string } }) => i.job.id === id).score;

    await rate(cookie, blocked1, ['company_blocked']);
    await rate(cookie, b, ['more_like_this']);
    const after = await recommendations(cookie);

    expect(after.hidden).toBe(2);
    expect(idsOf(after)).not.toContain(blocked1);
    expect(idsOf(after)).not.toContain(blocked2);
    expect(idsOf(after)[0]).toBe(b);
    expect(scoreOf(after, a)).toBe(scoreOf(before, a));
    expect(scoreOf(after, b)).toBe(scoreOf(before, b));
    expect(after.items[0].explanation[0]).toMatch(/avaliou bem/);
  });

  it('o aprendizado continua depois que a vaga avaliada é apagada', async () => {
    const { cookie, userId } = await user('fb-apaga@example.com');
    const blocked = await jobFor(userId, { company: 'Empresa Z' });
    const other = await jobFor(userId, { company: 'Empresa Z' });
    await rate(cookie, blocked, ['company_blocked']);
    await t.call(cookie, 'DELETE', `/v1/jobs/${blocked}`);
    expect(idsOf(await recommendations(cookie))).not.toContain(other);
  });

  it('não lista vaga ainda não analisada', async () => {
    const { cookie, userId } = await user('fb-pendente@example.com');
    const id = crypto.randomUUID();
    await jobs.insert(userId, {
      id,
      rawText: 'Pendente',
      applyUrl: null,
      dedupeHash: jobDedupeHash(id),
    });
    expect((await recommendations(cookie)).items).toEqual([]);
    expect((await rate(cookie, id, ['liked'])).statusCode).toBe(409);
  });

  it('apagar a conta remove as avaliações (cascata)', async () => {
    const { cookie, userId } = await user('fb-conta@example.com');
    await rate(cookie, await jobFor(userId), ['liked']);
    await t.db.pool.query('DELETE FROM users WHERE id = $1', [userId]);
    const { rows } = await t.db.pool.query(
      'SELECT count(*)::int AS n FROM job_feedback WHERE user_id = $1',
      [userId],
    );
    expect(rows[0].n).toBe(0);
  });
});
