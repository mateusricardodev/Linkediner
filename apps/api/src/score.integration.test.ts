import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RUBRIC_V1_WEIGHTS } from '@linkediner/core/profile';
import { startTestApp } from './testing/app';

let t: Awaited<ReturnType<typeof startTestApp>>;

beforeAll(async () => {
  t = await startTestApp();
}, 180_000);

afterAll(async () => t?.stop());

const getScore = (cookie: string) => t.call(cookie, 'GET', '/v1/profile/score');
const factorOf = (body: { factors: { criterion: string; points: number }[] }, criterion: string) =>
  body.factors.find((f) => f.criterion === criterion)!;

describe('score do perfil', () => {
  it('exige login e consentimentos aceitos', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/v1/profile/score' });
    expect(res.statusCode).toBe(401);
    const semAceite = await t.signUp('sem-aceite@example.com', { acceptConsents: false });
    expect((await getScore(semAceite)).statusCode).toBe(403);
  });

  it('funciona sem o consentimento de IA: o cálculo não envia nada ao provedor', async () => {
    const cookie = await t.signUp('sem-ia@example.com');
    const res = await getScore(cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ score: 0, rubricVersion: 'v1' });
    expect(res.json().disclaimer).toMatch(/Não indica chance de contratação/);
  });

  it('sobe conforme o perfil é preenchido e mostra a evolução', async () => {
    const cookie = await t.signUp('evolui@example.com');
    const first = (await getScore(cookie)).json();
    expect(first.score).toBe(0);

    await t.call(cookie, 'PATCH', '/v1/profile', { headline: 'Engenheira', summary: 'Resumo' });
    await t.call(cookie, 'PUT', '/v1/profile/links', {
      links: [{ kind: 'github', url: 'github.com/evolui' }],
    });
    await t.call(cookie, 'POST', '/v1/career-goals', {
      title: 'Frontend remoto',
      seniority: 'senior',
    });

    const second = (await getScore(cookie)).json();
    expect(factorOf(second, 'summary').points).toBe(RUBRIC_V1_WEIGHTS.summary);
    expect(factorOf(second, 'goal').points).toBe(RUBRIC_V1_WEIGHTS.goal);
    expect(factorOf(second, 'links').points).toBe(5);
    expect(second.score).toBe(15);
    expect(second.history.map((h: { score: number }) => h.score)).toEqual([0, 15]);
  });

  it('não cria histórico repetido quando nada mudou', async () => {
    const cookie = await t.signUp('estavel@example.com');
    await getScore(cookie);
    const again = (await getScore(cookie)).json();
    expect(again.history).toHaveLength(1);
  });

  it('o score de um usuário não aparece para outro', async () => {
    const a = await t.signUp('score-a@example.com');
    const b = await t.signUp('score-b@example.com');
    await t.call(a, 'PATCH', '/v1/profile', { headline: 'A', summary: 'B' });
    expect((await getScore(a)).json().score).toBe(RUBRIC_V1_WEIGHTS.summary);
    const other = (await getScore(b)).json();
    expect(other.score).toBe(0);
    expect(other.history).toHaveLength(1);
  });

  it('a aplicação não consegue alterar o histórico: as linhas só são inseridas', async () => {
    const { rows } = await t.db.pool.query(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE grantee = 'linkediner_app' AND table_name = 'profile_scores'`,
    );
    expect(rows.map((r) => r.privilege_type).sort()).toEqual(['INSERT', 'SELECT']);
  });

  it('apagar a conta remove o histórico (cascata)', async () => {
    const cookie = await t.signUp('cascata@example.com');
    await getScore(cookie);
    await t.db.pool.query("DELETE FROM users WHERE email = 'cascata@example.com'");
    const { rows } = await t.db.pool.query(
      `SELECT count(*)::int AS n FROM profile_scores s
       LEFT JOIN users u ON u.id = s.user_id WHERE u.id IS NULL`,
    );
    expect(rows[0].n).toBe(0);
  });
});
