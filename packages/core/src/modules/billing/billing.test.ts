import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { EntitlementService, type UsageRepository } from './application/entitlements';
import {
  SubscriptionService,
  type PaymentProvider,
  type SubscriptionRepository,
} from './application/subscriptions';
import { grantsPlan, periodOf, type SubscriptionEvent } from './domain/plan';
import {
  StripePaymentProvider,
  createPaymentProvider,
} from './infrastructure/stripe-payment-provider';

const USER = 'u1';
const clock = { now: () => new Date('2026-11-06T12:00:00Z') };

function entitlementSetup(limit = 2) {
  let used = 0;
  const repo: UsageRepository = {
    planOf: vi.fn(async () => ({
      key: 'free' as const,
      name: 'Gratuito',
      entitlements: [
        { featureKey: 'job.match' as const, limit, period: 'month' as const },
        { featureKey: 'export.watermark' as const, limit: 1, period: null },
      ],
    })),
    usedInPeriod: vi.fn(async () => new Map([['job.match', used]])),
    consume: vi.fn(async (_u, e) => {
      if (used + 1 > e.limit) return { allowed: false, used };
      used++;
      return { allowed: true, used };
    }),
    refund: vi.fn(async () => {}),
  };
  return { repo, service: new EntitlementService(repo, clock) };
}

describe('limites do plano', () => {
  it('recusa quando o limite acaba, dizendo qual e quando volta', async () => {
    const { service } = entitlementSetup(1);
    await service.consume(USER, 'job.match', 'a');
    await expect(service.consume(USER, 'job.match', 'b')).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
      status: 429,
      details: {
        feature: 'job.match',
        limit: 1,
        used: 1,
        resetsAt: '2026-12-01T00:00:00.000Z',
      },
    });
  });

  it('funcionalidade fora do plano nunca libera por engano', async () => {
    const { service, repo } = entitlementSetup();
    await expect(service.enabled(USER, 'sources.extra')).resolves.toBe(false);
    await expect(service.consume(USER, 'cover_letter', 'k')).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    });
    expect(repo.consume).toHaveBeenCalledWith(USER, expect.objectContaining({ limit: 0 }));
  });

  it('valor fixo não tem contador', async () => {
    const { service } = entitlementSetup();
    const { features } = await service.summary(USER);
    expect(features.find((f) => f.feature === 'export.watermark')).toEqual({
      feature: 'export.watermark',
      limit: 1,
      used: null,
      remaining: null,
      resetsAt: null,
    });
    expect(features.find((f) => f.feature === 'job.match')).toMatchObject({
      used: 0,
      remaining: 2,
    });
  });

  it('o período é o mês em UTC, inclusive na virada do ano', () => {
    expect(periodOf(new Date('2026-12-31T23:59:59Z'))).toEqual({
      key: '2026-12',
      resetsAt: new Date('2027-01-01T00:00:00Z'),
    });
  });

  it('assinatura só dá direito ao plano nos status válidos', () => {
    expect(['active', 'trialing', 'past_due'].every(grantsPlan)).toBe(true);
    expect(
      ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'].some(grantsPlan),
    ).toBe(false);
  });
});

const event: SubscriptionEvent = {
  eventId: 'evt_1',
  occurredAt: new Date(0),
  userId: USER,
  planKey: 'pro',
  status: 'active',
  providerCustomerId: 'cus_1',
  providerSubscriptionId: 'sub_1',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

function subscriptionSetup(o: { current?: string | null; provider?: boolean } = {}) {
  const provider: PaymentProvider = {
    id: 'fake',
    createCheckout: vi.fn(async () => 'https://pagamento.example/checkout'),
    createPortal: vi.fn(async () => 'https://pagamento.example/portal'),
    parseWebhook: vi.fn(() => event),
    deleteCustomer: vi.fn(async () => {}),
  };
  const repo: SubscriptionRepository = {
    emailOf: vi.fn(async () => 'pessoa@example.com'),
    find: vi.fn(async () =>
      o.current
        ? {
            userId: USER,
            planKey: 'pro' as const,
            status: o.current,
            providerCustomerId: 'cus_1',
            providerSubscriptionId: 'sub_1',
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
          }
        : null,
    ),
    applyEvent: vi.fn(async () => true),
  };
  const record = vi.fn(async () => {});
  const service = new SubscriptionService(
    repo,
    o.provider === false ? null : provider,
    { record },
    { web: 'https://app.example' },
  );
  return { service, provider, repo, record };
}

describe('assinatura', () => {
  it('sem provedor configurado, pagar fica indisponível, e cancelar não finge que deu certo', async () => {
    const free = subscriptionSetup({ provider: false });
    await expect(free.service.checkout(USER, 'pro')).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    });
    await expect(free.service.cancelForUser(USER)).resolves.toBe(0);
    const paying = subscriptionSetup({ provider: false, current: 'active' });
    await expect(paying.service.cancelForUser(USER)).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    });
  });

  it('quem já assina muda o plano pelo portal, e quem cancelou pode assinar de novo', async () => {
    await expect(
      subscriptionSetup({ current: 'active' }).service.checkout(USER, 'pro'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const back = subscriptionSetup({ current: 'canceled' });
    await back.service.checkout(USER, 'pro');
    expect(back.provider.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cus_1', plan: 'pro' }),
    );
  });

  it('webhook com assinatura inválida é recusado, sem mudar nada', async () => {
    const { service, provider, repo } = subscriptionSetup();
    vi.mocked(provider.parseWebhook).mockImplementation(() => {
      throw new Error('assinatura errada');
    });
    await expect(service.handleWebhook(Buffer.from('{}'), 'x')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(repo.applyEvent).not.toHaveBeenCalled();
  });

  it('audita só plano e status, e o evento repetido não audita de novo', async () => {
    const { service, repo, record } = subscriptionSetup();
    await service.handleWebhook(Buffer.from('{}'), 'x');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { plan: 'pro', status: 'active' } }),
    );
    vi.mocked(repo.applyEvent).mockResolvedValue(false);
    record.mockClear();
    await service.handleWebhook(Buffer.from('{}'), 'x');
    expect(record).not.toHaveBeenCalled();
  });

  it('na exclusão da conta, apaga o cliente no provedor', async () => {
    const { service, provider } = subscriptionSetup({ current: 'active' });
    await expect(service.cancelForUser(USER)).resolves.toBe(1);
    expect(provider.deleteCustomer).toHaveBeenCalledWith('cus_1');
  });
});

describe('Stripe', () => {
  const secret = 'whsec_chave_de_teste'; // gitleaks:allow
  const provider = new StripePaymentProvider({
    secretKey: 'sk_test_ficticia', // gitleaks:allow
    webhookSecret: secret,
    prices: { pro: 'price_pro', advanced: 'price_advanced' },
  });
  const payload = (o: { type?: string; price?: string; metadata?: Record<string, string> } = {}) =>
    JSON.stringify({
      id: 'evt_1',
      object: 'event',
      created: 1000,
      type: o.type ?? 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          object: 'subscription',
          status: 'active',
          customer: 'cus_1',
          cancel_at_period_end: true,
          metadata: o.metadata ?? { userId: USER },
          items: {
            data: [{ price: { id: o.price ?? 'price_advanced' }, current_period_end: 2000 }],
          },
        },
      },
    });
  const signed = (body: string) =>
    new Stripe('sk_test_ficticia').webhooks.generateTestHeaderString({ payload: body, secret }); // gitleaks:allow

  it('traduz a assinatura, com o plano vindo do preço', () => {
    const body = payload();
    expect(provider.parseWebhook(Buffer.from(body), signed(body))).toEqual({
      eventId: 'evt_1',
      occurredAt: new Date(1_000_000),
      userId: USER,
      planKey: 'advanced',
      status: 'active',
      providerCustomerId: 'cus_1',
      providerSubscriptionId: 'sub_1',
      currentPeriodEnd: new Date(2_000_000),
      cancelAtPeriodEnd: true,
    });
  });

  it('recusa corpo adulterado', () => {
    const body = payload();
    expect(() =>
      provider.parseWebhook(Buffer.from(payload({ price: 'price_pro' })), signed(body)),
    ).toThrow();
  });

  it('ignora outros eventos, outros produtos e assinatura sem usuário', () => {
    for (const body of [
      payload({ type: 'invoice.paid' }),
      payload({ price: 'price_de_outro_produto' }),
      payload({ metadata: {} }),
    ]) {
      expect(provider.parseWebhook(Buffer.from(body), signed(body))).toBeNull();
    }
  });

  it('sem configuração completa, não há provedor', () => {
    expect(createPaymentProvider({})).toBeNull();
    expect(createPaymentProvider({ STRIPE_SECRET_KEY: 'sk_test_ficticia' })).toBeNull(); // gitleaks:allow
  });
});
