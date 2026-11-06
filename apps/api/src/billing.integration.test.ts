import Stripe from 'stripe';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { StripePaymentProvider, type PaymentProvider } from '@linkediner/core/billing';
import { FEATURE_KEYS } from '@linkediner/core/shared';
import { DrizzleFactRepository } from '@linkediner/core/profile';
import { startTestApp } from './testing/app';

// Dados fictícios. Nenhuma chamada real à Stripe: só a conferência local da assinatura do webhook.
const WEBHOOK_SECRET = 'whsec_chave_de_teste'; // gitleaks:allow
const SECRET_KEY = 'sk_test_ficticia'; // gitleaks:allow
const stripe = new StripePaymentProvider({
  secretKey: SECRET_KEY,
  webhookSecret: WEBHOOK_SECRET,
  prices: { pro: 'price_pro', advanced: 'price_advanced' },
});
const payments: PaymentProvider = {
  id: 'stripe',
  createCheckout: vi.fn(async () => 'https://pagamento.example/checkout'),
  createPortal: vi.fn(async () => 'https://pagamento.example/portal'),
  parseWebhook: (body, signature) => stripe.parseWebhook(body, signature),
  deleteCustomer: vi.fn(async () => {}),
};

let t: Awaited<ReturnType<typeof startTestApp>>;
let eventCount = 0;

beforeAll(async () => {
  t = await startTestApp({ realQuota: true, payments });
}, 180_000);
afterAll(async () => t?.stop());
beforeEach(() => {
  vi.mocked(payments.createCheckout).mockClear();
});

async function setup(email: string) {
  const cookie = await t.signUp(email);
  const userId = (await t.call(cookie, 'GET', '/v1/me')).json().user.id as string;
  await t.call(cookie, 'PUT', '/v1/me/consents/ai_processing', { granted: true });
  return { cookie, userId };
}

function webhook(
  userId: string,
  o: {
    status?: string;
    price?: string;
    subscription?: string;
    created?: number;
    id?: string;
    type?: string;
    signature?: string;
  } = {},
) {
  const body = JSON.stringify({
    id: o.id ?? `evt_${++eventCount}`,
    object: 'event',
    created: o.created ?? 1_000_000 + eventCount,
    type: o.type ?? 'customer.subscription.updated',
    data: {
      object: {
        id: o.subscription ?? `sub_${userId}`,
        object: 'subscription',
        status: o.status ?? 'active',
        customer: `cus_${userId}`,
        cancel_at_period_end: false,
        metadata: { userId },
        items: { data: [{ price: { id: o.price ?? 'price_pro' }, current_period_end: 2_000_000 }] },
      },
    },
  });
  const signature =
    o.signature ??
    new Stripe(SECRET_KEY).webhooks.generateTestHeaderString({
      payload: body,
      secret: WEBHOOK_SECRET,
    });
  return t.app.inject({
    method: 'POST',
    url: '/v1/billing/webhook',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    payload: body,
  });
}

const planOf = async (cookie: string) =>
  (await t.call(cookie, 'GET', '/v1/billing')).json().plan.key as string;
const featureOf = async (cookie: string, feature: string) =>
  (await t.call(cookie, 'GET', '/v1/billing'))
    .json()
    .features.find((f: { feature: string }) => f.feature === feature);

describe('planos', () => {
  it('todo plano tem um valor para cada funcionalidade', async () => {
    const { rows } = await t.db.pool.query(
      `SELECT p.key, count(*)::int AS n FROM plan_entitlements e JOIN plans p ON p.id = e.plan_id GROUP BY p.key`,
    );
    expect(rows.map((r) => r.key).sort()).toEqual(['advanced', 'free', 'pro']);
    for (const row of rows) expect(row.n).toBe(FEATURE_KEYS.length);
  });

  it('conta nova está no gratuito, com o consumo do mês', async () => {
    const { cookie } = await setup('plano-novo@example.com');
    expect(await planOf(cookie)).toBe('free');
    expect(await featureOf(cookie, 'job.match')).toMatchObject({
      limit: 10,
      used: 0,
      remaining: 10,
      resetsAt: expect.any(String),
    });
    expect(await featureOf(cookie, 'export.watermark')).toMatchObject({ limit: 1, used: null });
  });

  it('o consumo não pode ser alterado nem apagado pelo papel da aplicação', async () => {
    const { rows } = await t.db.pool.query(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE table_name = 'usage_records' AND grantee = 'linkediner_app' ORDER BY 1`,
    );
    expect(rows.map((r) => r.privilege_type)).toEqual(['INSERT', 'SELECT']);
  });
});

describe('limites', () => {
  const importJob = (cookie: string, n: number) =>
    t.app.inject({
      method: 'POST',
      url: '/v1/jobs/import',
      headers: { cookie, origin: 'http://localhost:3000', 'content-type': 'application/json' },
      payload: { text: `Vaga fictícia número ${n}. `.repeat(10) },
      remoteAddress: `10.0.3.${n}`,
    });

  it('para no limite do gratuito, e o mesmo texto não conta de novo', async () => {
    const { cookie } = await setup('limite-vagas@example.com');
    for (let n = 1; n <= 10; n++) expect((await importJob(cookie, n)).statusCode).toBe(202);
    expect((await featureOf(cookie, 'job.match')).remaining).toBe(0);

    // Texto já importado: devolve a vaga, mesmo sem saldo.
    expect((await importJob(cookie, 1)).statusCode).toBeLessThan(300);

    const denied = await importJob(cookie, 11);
    expect(denied.statusCode).toBe(429);
    expect(denied.json()).toMatchObject({
      code: 'QUOTA_EXCEEDED',
      details: { feature: 'job.match', limit: 10, used: 10 },
    });
  });

  it('pedidos simultâneos não passam do limite', async () => {
    const { userId } = await setup('limite-corrida@example.com');
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => t.quota.consume(userId, 'profile.analysis', `k${i}`)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
  });

  it('repetir a chave não consome de novo, e estornar devolve uma vez só', async () => {
    const { cookie, userId } = await setup('limite-chave@example.com');
    await t.quota.consume(userId, 'profile.analysis', 'k');
    await t.quota.consume(userId, 'profile.analysis', 'k');
    expect((await featureOf(cookie, 'profile.analysis')).used).toBe(1);
    await t.quota.refund(userId, 'profile.analysis', 'k');
    await t.quota.refund(userId, 'profile.analysis', 'k');
    expect((await featureOf(cookie, 'profile.analysis')).used).toBe(0);
    await t.quota.refund(userId, 'profile.analysis', 'nunca-consumida');
    expect((await featureOf(cookie, 'profile.analysis')).used).toBe(0);
  });

  it('o plano gratuito não gera material por vaga', async () => {
    const { cookie, userId } = await setup('limite-material@example.com');
    await new DrizzleFactRepository(t.db.db, t.cipher).addConfirmed(userId, {
      type: 'skill',
      data: { name: 'React' },
    });
    const job = await importJob(cookie, 50);
    await t.db.pool.query(`UPDATE jobs SET status = 'ready' WHERE user_id = $1`, [userId]);
    const application = await t.call(cookie, 'POST', '/v1/applications', {
      jobId: job.json().id,
    });
    const id = application.json().id as string;
    const res = await t.call(cookie, 'POST', `/v1/applications/${id}/materials`, {
      kind: 'cover_letter',
    });
    expect(res.statusCode).toBe(429);
    // A candidatura não muda de estado por causa de um pedido recusado.
    const detail = await t.call(cookie, 'GET', `/v1/applications/${id}`);
    expect(detail.json().application.state).toBe('saved');
    expect(t.materialQueue.jobs).toEqual([]);
  });
});

describe('assinatura', () => {
  it('voltar do pagamento não libera nada: só o webhook muda o plano', async () => {
    const { cookie, userId } = await setup('ass-webhook@example.com');
    const checkout = await t.call(cookie, 'POST', '/v1/billing/checkout', { plan: 'pro' });
    expect(checkout.json()).toEqual({ url: 'https://pagamento.example/checkout' });
    expect(await planOf(cookie)).toBe('free');

    expect((await webhook(userId)).statusCode).toBe(200);
    expect(await planOf(cookie)).toBe('pro');
    expect(await featureOf(cookie, 'job.match')).toMatchObject({ limit: 300 });
    expect(await featureOf(cookie, 'export.watermark')).toMatchObject({ limit: 0 });
  });

  it('recusa webhook sem assinatura válida, e não muda nada', async () => {
    const { cookie, userId } = await setup('ass-falsa@example.com');
    expect((await webhook(userId, { signature: 't=1,v1=falsa' })).statusCode).toBe(400);
    const missing = await t.app.inject({
      method: 'POST',
      url: '/v1/billing/webhook',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(missing.statusCode).toBe(400);
    expect(await planOf(cookie)).toBe('free');
  });

  it('evento repetido ou mais antigo não muda a assinatura', async () => {
    const { cookie, userId } = await setup('ass-ordem@example.com');
    await webhook(userId, { id: 'evt_novo', created: 2_000_000, price: 'price_advanced' });
    expect(await planOf(cookie)).toBe('advanced');
    await webhook(userId, { id: 'evt_velho', created: 1_000, price: 'price_pro' });
    expect(await planOf(cookie)).toBe('advanced');
    await webhook(userId, { id: 'evt_novo', created: 3_000_000, status: 'canceled' });
    expect(await planOf(cookie)).toBe('advanced');
  });

  it('cancelar volta ao gratuito, e o fim de uma assinatura antiga não derruba a nova', async () => {
    const { cookie, userId } = await setup('ass-cancela@example.com');
    await webhook(userId, { subscription: 'sub_a', created: 2_000_000 });
    await webhook(userId, { subscription: 'sub_a', created: 2_000_001, status: 'canceled' });
    expect(await planOf(cookie)).toBe('free');
    await webhook(userId, { subscription: 'sub_b', created: 2_000_002 });
    expect(await planOf(cookie)).toBe('pro');
    await webhook(userId, { subscription: 'sub_a', created: 2_000_003, status: 'canceled' });
    expect(await planOf(cookie)).toBe('pro');
  });

  it('quem assina não abre outro pagamento, e usa o portal', async () => {
    const { cookie, userId } = await setup('ass-portal@example.com');
    await webhook(userId);
    const again = await t.call(cookie, 'POST', '/v1/billing/checkout', { plan: 'advanced' });
    expect(again.statusCode).toBe(409);
    const portal = await t.call(cookie, 'POST', '/v1/billing/portal');
    expect(portal.json()).toEqual({ url: 'https://pagamento.example/portal' });
    expect(payments.createPortal).toHaveBeenCalledWith(
      `cus_${userId}`,
      'http://localhost:3000/assinatura',
    );
  });

  it('webhook de conta que não existe mais é aceito e ignorado', async () => {
    const res = await webhook(crypto.randomUUID());
    expect(res.statusCode).toBe(200);
  });

  it('na exclusão da conta, apaga o cliente no provedor', async () => {
    const { userId } = await setup('ass-exclui@example.com');
    await webhook(userId);
    await expect(t.subscriptions.cancelForUser(userId)).resolves.toBe(1);
    expect(payments.deleteCustomer).toHaveBeenCalledWith(`cus_${userId}`);
  });
});
