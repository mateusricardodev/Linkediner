import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp } from './testing/app';

let t: Awaited<ReturnType<typeof startTestApp>>;
let alice = '';
let bob = '';

beforeAll(async () => {
  t = await startTestApp();
  alice = await t.signUp('alice@example.com');
  bob = await t.signUp('bob@example.com');
}, 120_000);

afterAll(async () => t?.stop());

const goal = {
  title: 'Frontend sênior remoto Brasil',
  seniority: 'senior',
  targetRoles: ['Frontend Engineer', 'Full Stack Engineer'],
  locations: ['Brasil'],
};

describe('perfil profissional', () => {
  it('exige consentimentos aceitos', async () => {
    const carol = await t.signUp('carol@example.com', { acceptConsents: false });
    const res = await t.call(carol, 'GET', '/v1/profile');
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('CONSENT_REQUIRED');
  });

  it('cria o perfil vazio no primeiro acesso', async () => {
    const res = await t.call(alice, 'GET', '/v1/profile');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      headline: null,
      summary: null,
      yearsExperience: null,
      links: [],
    });
  });

  it('atualiza título, resumo e anos de experiência', async () => {
    const res = await t.call(alice, 'PATCH', '/v1/profile', {
      headline: '  Engenheira Frontend  ',
      yearsExperience: 6,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      headline: 'Engenheira Frontend',
      yearsExperience: 6,
      summary: null,
    });
  });

  it('rejeita valores fora das regras', async () => {
    const res = await t.call(alice, 'PATCH', '/v1/profile', { yearsExperience: 99 });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { field: 'yearsExperience' },
    });
  });

  it('salva links normalizados', async () => {
    const res = await t.call(alice, 'PUT', '/v1/profile/links', {
      links: [
        { kind: 'linkedin', url: 'linkedin.com/in/alice' },
        { kind: 'github', url: 'http://GitHub.com/alice/' },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().links).toEqual([
      { kind: 'linkedin', url: 'https://linkedin.com/in/alice' },
      { kind: 'github', url: 'https://github.com/alice' },
    ]);
    expect((await t.call(alice, 'GET', '/v1/profile')).json().links).toHaveLength(2);
  });

  it('rejeita link local ou fora do domínio esperado', async () => {
    const res = await t.call(alice, 'PUT', '/v1/profile/links', {
      links: [{ kind: 'portfolio', url: 'http://localhost:8080' }],
    });
    expect(res.statusCode).toBe(400);
  });

  it('perfil de um usuário não aparece para outro', async () => {
    const res = await t.call(bob, 'GET', '/v1/profile');
    expect(res.json()).toMatchObject({ headline: null, links: [] });
  });
});

describe('objetivos de carreira', () => {
  let goalId = '';

  it('cria um objetivo com valores padrão', async () => {
    const res = await t.call(alice, 'POST', '/v1/career-goals', goal);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      ...goal,
      remoteOnly: true,
      isActive: true,
      salaryMin: null,
    });
    goalId = res.json().id;
  });

  it('exige salário completo (valor, moeda e período)', async () => {
    const res = await t.call(alice, 'POST', '/v1/career-goals', { ...goal, salaryMin: 15000 });
    expect(res.statusCode).toBe(400);
  });

  it('permite vários objetivos e respeita o limite de ativos', async () => {
    for (let i = 0; i < 4; i++) {
      expect(
        (await t.call(alice, 'POST', '/v1/career-goals', { ...goal, title: `Objetivo ${i}` }))
          .statusCode,
      ).toBe(201);
    }
    const sixth = await t.call(alice, 'POST', '/v1/career-goals', { ...goal, title: 'Sexto' });
    expect(sixth.statusCode).toBe(409);
    const inactive = await t.call(alice, 'POST', '/v1/career-goals', {
      ...goal,
      title: 'Inativo',
      isActive: false,
    });
    expect(inactive.statusCode).toBe(201);
    expect((await t.call(alice, 'GET', '/v1/career-goals')).json()).toHaveLength(6);
  });

  it('atualiza parcialmente um objetivo', async () => {
    const res = await t.call(alice, 'PATCH', `/v1/career-goals/${goalId}`, {
      salaryMin: 18000,
      currency: 'BRL',
      salaryPeriod: 'month',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ title: goal.title, salaryMin: 18000, currency: 'BRL' });
  });

  it('outro usuário não lê, altera nem apaga o objetivo (404)', async () => {
    expect((await t.call(bob, 'GET', '/v1/career-goals')).json()).toEqual([]);
    expect(
      (await t.call(bob, 'PATCH', `/v1/career-goals/${goalId}`, { title: 'Invasão' })).statusCode,
    ).toBe(404);
    expect((await t.call(bob, 'DELETE', `/v1/career-goals/${goalId}`)).statusCode).toBe(404);
    const mine = await t.call(alice, 'GET', '/v1/career-goals');
    expect(mine.json().find((g: { id: string }) => g.id === goalId).title).toBe(goal.title);
  });

  it('remove um objetivo', async () => {
    expect((await t.call(alice, 'DELETE', `/v1/career-goals/${goalId}`)).statusCode).toBe(204);
    expect(
      (await t.call(alice, 'PATCH', `/v1/career-goals/${goalId}`, { title: 'X' })).statusCode,
    ).toBe(404);
  });

  it('ID inválido devolve 400', async () => {
    expect((await t.call(alice, 'DELETE', '/v1/career-goals/nao-e-uuid')).statusCode).toBe(400);
  });
});
