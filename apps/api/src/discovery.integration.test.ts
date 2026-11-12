import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeAiProvider, structureJobV1 } from '@linkediner/core/ai';
import {
  DrizzleCatalogRepository,
  StructureCatalog,
  SyncCatalog,
  type ExternalPosting,
} from '@linkediner/core/discovery';
import { startTestApp } from './testing/app';

// Vagas fictícias. Nenhuma chamada real às fontes nem à IA acontece aqui.
const posting = (o: Partial<ExternalPosting> = {}): ExternalPosting => ({
  externalId: 'um',
  title: 'Senior Backend Engineer',
  location: 'São Paulo, Brazil',
  remoteHint: false,
  applyUrl: 'https://empresa.example/vagas/um',
  postedAt: new Date('2026-11-05T12:00:00.000Z'),
  body: 'Requisitos: Go, Postgres e Kubernetes.',
  ...o,
});

let t: Awaited<ReturnType<typeof startTestApp>>;
let current: ExternalPosting[] = [];
let sync: SyncCatalog;
let structure: StructureCatalog;
let ai: FakeAiProvider;

beforeAll(async () => {
  t = await startTestApp();
  const catalog = new DrizzleCatalogRepository(t.db.db);
  sync = new SyncCatalog({
    catalog,
    adapters: [{ key: 'greenhouse', listPostings: async () => current }],
    wait: async () => {},
  });
  ai = new FakeAiProvider().respond('structure_job', () => ({
    title: null,
    company: null,
    location: null,
    employmentType: null,
    salaryText: null,
    remotePolicy: 'hybrid',
    seniority: 'senior',
    mustHave: ['Go', 'Postgres', 'Kubernetes'],
    niceToHave: [],
  }));
  structure = new StructureCatalog({
    catalog,
    ai,
    prompt: structureJobV1,
    wait: async () => {},
    limit: 10,
    intervalMs: 0,
  });
}, 180_000);

afterAll(async () => t?.stop());

async function setSource(status: 'active' | 'disabled') {
  await t.db.pool.query('UPDATE job_sources SET status = $1', [status]);
}

/** Assinatura paga gravada direto, sem passar pela Stripe: aqui só importa o plano em vigor. */
async function makePaid(cookie: string) {
  const userId = (await t.call(cookie, 'GET', '/v1/me')).json().user.id as string;
  await t.db.pool.query(
    `INSERT INTO subscriptions
       (id, user_id, plan_id, status, provider, provider_customer_id, provider_subscription_id, last_event_at)
     SELECT gen_random_uuid(), $1::uuid, id, 'active', 'stripe', 'cus_' || $1::text, 'sub_' || $1::text, now()
     FROM plans WHERE key = 'pro'
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

/** Objetivo de quem está no plano pago, que é quem recebe as vagas encontradas. */
async function goalFor(cookie: string, body: Record<string, unknown> = {}, { paid = true } = {}) {
  if (paid) await makePaid(cookie);
  const res = await t.call(cookie, 'POST', '/v1/career-goals', {
    title: 'Backend',
    seniority: 'senior',
    remoteOnly: false,
    ...body,
  });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}

const feed = async (cookie: string, query = '') =>
  (await t.call(cookie, 'GET', `/v1/discovery${query}`)).json();

describe('vagas automáticas', () => {
  it('as fontes começam desligadas: nenhuma chamada, nenhuma vaga', async () => {
    const listPostings = async () => {
      throw new Error('não deveria chamar');
    };
    const off = new SyncCatalog({
      catalog: new DrizzleCatalogRepository(t.db.db),
      adapters: [
        { key: 'greenhouse', listPostings },
        { key: 'lever', listPostings },
      ],
      wait: async () => {},
    });
    await expect(off.run()).resolves.toMatchObject({ boards: 0 });

    const cookie = await t.signUp('desligada@example.com');
    expect(await feed(cookie)).toEqual({ state: 'disabled' });
  });

  it('as empresas iniciais estão lá, e a aplicação só consegue ler o catálogo', async () => {
    const { rows } = await t.db.pool.query('SELECT count(*)::int AS n FROM job_boards');
    expect(rows[0].n).toBe(52);
    await expect(
      t.db.pool.query(`
        BEGIN;
        SET LOCAL ROLE linkediner_app;
        UPDATE job_sources SET status = 'active';
      `),
    ).rejects.toThrow(/permission denied/);
    await t.db.pool.query('ROLLBACK');
  });

  describe('com a fonte ligada', () => {
    beforeAll(async () => {
      await setSource('active');
      // Só uma empresa, para o teste não depender das outras.
      await t.db.pool.query(`UPDATE job_boards SET enabled = (token = 'c6bank')`);
    });
    afterAll(async () => setSource('disabled'));

    it('pede um objetivo antes de mostrar vagas', async () => {
      const cookie = await t.signUp('semobjetivo@example.com');
      expect(await feed(cookie)).toMatchObject({ state: 'needs_goal' });
    });

    it('filtra pelo objetivo, ordena pelas recentes e guarda só o que interessa', async () => {
      current = [
        posting({ externalId: 'antiga', postedAt: new Date('2026-10-01T12:00:00.000Z') }),
        posting({ externalId: 'nova', title: 'Backend Developer' }),
        posting({ externalId: 'front', title: 'Frontend Engineer' }),
        posting({ externalId: 'fora', location: 'Remote, United States' }),
        posting({ externalId: 'outra-area', title: 'Advogado' }),
      ];
      await expect(sync.run()).resolves.toMatchObject({ failed: 0, inserted: 3 });

      const cookie = await t.signUp('filtro@example.com');
      await goalFor(cookie);
      const result = await feed(cookie);
      expect(result.state).toBe('ready');
      expect(result.total).toBe(2);
      expect(result.items.map((i: { title: string }) => i.title)).toEqual([
        'Backend Developer',
        'Senior Backend Engineer',
      ]);
      expect(result.items[0]).toMatchObject({ analyzed: false, score: null, source: 'greenhouse' });
      expect(result.disclaimer).toMatch(/Não indica chance de contratação/);
    });

    it('objetivo de quem está no plano gratuito não gasta análise', async () => {
      const cookie = await t.signUp('gratuito@example.com');
      await goalFor(cookie, {}, { paid: false });
      // Só o objetivo gratuito fica ativo durante a rodada.
      const { rows } = await t.db.pool.query<{ id: string }>(
        `UPDATE career_goals SET is_active = false
         WHERE is_active AND user_id <> (SELECT id FROM users WHERE email = 'gratuito@example.com')
         RETURNING id`,
      );
      const calls = ai.calls.length;
      await expect(structure.run()).resolves.toMatchObject({ structured: 0 });
      expect(ai.calls.length).toBe(calls);
      await t.db.pool.query(`UPDATE career_goals SET is_active = true WHERE id = ANY($1)`, [
        rows.map((r) => r.id),
      ]);
    });

    it('a análise roda uma vez para todo mundo, e cada um vê a sua nota', async () => {
      const calls = ai.calls.length;
      await expect(structure.run()).resolves.toMatchObject({ structured: 2 });
      expect(ai.calls.length).toBe(calls + 2);
      await expect(structure.run()).resolves.toMatchObject({ structured: 0 });
      expect(ai.calls.length).toBe(calls + 2);

      const cookie = await t.signUp('nota@example.com');
      await goalFor(cookie);
      const { items } = await feed(cookie);
      expect(items[0]).toMatchObject({ analyzed: true });
      expect(items[0].score).not.toBeNull();
      // O perfil e o objetivo não vão para o provedor: a IA só viu o texto das vagas.
      for (const call of ai.calls) {
        expect(Object.keys(call.promptInput)).toEqual(['jobText']);
      }
    });

    it('salvar copia a vaga e ela segue o caminho normal, sem aparecer de novo', async () => {
      const cookie = await t.signUp('salvar@example.com');
      await goalFor(cookie);
      const { items, total } = await feed(cookie);
      const id = items[0].id as string;

      const saved = await t.call(cookie, 'POST', `/v1/discovery/${id}/save`);
      expect(saved.statusCode).toBe(200);
      const job = saved.json();
      expect(job).toMatchObject({
        status: 'ready',
        source: 'greenhouse',
        title: items[0].title,
        applyUrl: items[0].applyUrl,
        seniority: 'senior',
      });
      expect(job.mustHave).toEqual(['Go', 'Postgres', 'Kubernetes']);

      const again = await t.call(cookie, 'POST', `/v1/discovery/${id}/save`);
      expect(again.json().id).toBe(job.id);
      expect((await t.call(cookie, 'GET', '/v1/jobs')).json()).toHaveLength(1);

      expect((await t.call(cookie, 'GET', `/v1/jobs/${job.id}/match`)).statusCode).toBe(200);
      const application = await t.call(cookie, 'POST', '/v1/applications', { jobId: job.id });
      expect(application.statusCode).toBe(201);

      const after = await feed(cookie);
      expect(after.total).toBe(total - 1);
      expect(after.items.map((i: { id: string }) => i.id)).not.toContain(id);
    });

    it('o que uma pessoa salva não muda a lista nem os dados de outra', async () => {
      const ana = await t.signUp('ana-catalogo@example.com');
      const bia = await t.signUp('bia-catalogo@example.com');
      await goalFor(ana);
      await goalFor(bia);
      const { items } = await feed(ana);
      const saved = await t.call(ana, 'POST', `/v1/discovery/${items[0].id}/save`);
      const jobId = saved.json().id as string;

      const biaFeed = await feed(bia);
      expect(biaFeed.items.map((i: { id: string }) => i.id)).toContain(items[0].id);
      expect((await t.call(bia, 'GET', '/v1/jobs')).json()).toEqual([]);
      expect((await t.call(bia, 'GET', `/v1/jobs/${jobId}`)).statusCode).toBe(404);
    });

    it('vaga ainda em análise não pode ser salva, e objetivo de outra pessoa não vale', async () => {
      current = [...current, posting({ externalId: 'recem', title: 'Backend Lead' })];
      await sync.run();
      const cookie = await t.signUp('emanalise@example.com');
      await goalFor(cookie);
      const { items } = await feed(cookie);
      const waiting = items.find((i: { analyzed: boolean }) => !i.analyzed);
      expect(waiting).toBeDefined();
      const res = await t.call(cookie, 'POST', `/v1/discovery/${waiting.id}/save`);
      expect(res.statusCode).toBe(409);
      expect(res.json().title).toMatch(/em análise/);

      const other = await t.signUp('outraobj@example.com');
      const goalId = await goalFor(other);
      expect((await t.call(cookie, 'GET', `/v1/discovery?goalId=${goalId}`)).statusCode).toBe(404);
    });

    it('empresa bloqueada pela pessoa sai da lista', async () => {
      const cookie = await t.signUp('bloqueio@example.com');
      await goalFor(cookie);
      const { items } = await feed(cookie);
      const analyzed = items.find((i: { analyzed: boolean }) => i.analyzed);
      const job = (await t.call(cookie, 'POST', `/v1/discovery/${analyzed.id}/save`)).json();
      await t.call(cookie, 'PUT', `/v1/jobs/${job.id}/feedback`, { reasons: ['company_blocked'] });
      expect((await feed(cookie)).items).toEqual([]);
    });

    it('vaga que sai do ar some do catálogo, mas a cópia salva continua', async () => {
      const cookie = await t.signUp('saiudoar@example.com');
      await goalFor(cookie);
      const { items } = await feed(cookie);
      const analyzed = items.find((i: { analyzed: boolean }) => i.analyzed);
      const job = (await t.call(cookie, 'POST', `/v1/discovery/${analyzed.id}/save`)).json();

      current = [];
      await expect(sync.run()).resolves.toMatchObject({ failed: 0 });
      expect((await feed(cookie)).total).toBe(0);
      const copy = await t.call(cookie, 'GET', `/v1/jobs/${job.id}`);
      expect(copy.statusCode).toBe(200);
      expect(copy.json().title).toBe(analyzed.title);
      const gone = await t.call(cookie, 'POST', `/v1/discovery/${analyzed.id}/save`);
      expect(gone.statusCode).toBe(404);
    });

    it('texto alterado na fonte volta para análise', async () => {
      current = [posting({ externalId: 'muda', body: 'Primeira versão' })];
      await sync.run();
      await structure.run();
      const before = ai.calls.length;
      await structure.run();
      expect(ai.calls.length).toBe(before);

      current = [posting({ externalId: 'muda', body: 'Segunda versão' })];
      await expect(sync.run()).resolves.toMatchObject({ updated: 1 });
      await structure.run();
      expect(ai.calls.length).toBe(before + 1);
    });

    it('desligar a fonte tira as vagas da tela na hora', async () => {
      const cookie = await t.signUp('desliga@example.com');
      await goalFor(cookie);
      expect((await feed(cookie)).state).toBe('ready');
      await setSource('disabled');
      expect(await feed(cookie)).toEqual({ state: 'disabled' });
      await setSource('active');
    });
  });
});
