import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  BillingSummaryDto,
  BillingUrlDto,
  CheckoutBody,
  ProblemDetails,
} from '@linkediner/contracts';
import type { EntitlementService, SubscriptionService } from '@linkediner/core/billing';
import type { ConsentService } from '@linkediner/core/privacy';
import { AppError } from '@linkediner/core/shared';
import { actorOf, requireActor } from '../plugins/auth';
import { requireConsents } from '../plugins/require-consents';

export interface BillingDeps {
  entitlements: EntitlementService;
  subscriptions: SubscriptionService;
  consents: Pick<ConsentService, 'status'>;
}

const errors = {
  400: ProblemDetails,
  401: ProblemDetails,
  403: ProblemDetails,
  404: ProblemDetails,
  409: ProblemDetails,
  503: ProblemDetails,
};

/** Plano, consumo e assinatura. O cartão é digitado só na página do provedor de pagamento. */
export const billingRoutes =
  (deps: BillingDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = [requireActor, requireConsents(deps.consents)];
    const tags = ['planos'];

    app.get(
      '/v1/billing',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Plano em vigor e consumo do mês',
          response: { 200: BillingSummaryDto, ...errors },
        },
      },
      async (req) => {
        const { plan, features } = await deps.entitlements.summary(actorOf(req).userId);
        return {
          plan,
          features: features.map((f) => ({ ...f, resetsAt: f.resetsAt?.toISOString() ?? null })),
        };
      },
    );

    app.post(
      '/v1/billing/checkout',
      {
        preHandler,
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
        schema: {
          tags,
          summary: 'Abre o pagamento no provedor. O plano só muda quando o provedor confirmar',
          body: CheckoutBody,
          response: { 200: BillingUrlDto, ...errors },
        },
      },
      async (req) => ({
        url: await deps.subscriptions.checkout(actorOf(req).userId, req.body.plan),
      }),
    );

    app.post(
      '/v1/billing/portal',
      {
        preHandler,
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
        schema: {
          tags,
          summary: 'Abre o portal do provedor, para trocar de plano, cartão ou cancelar',
          response: { 200: BillingUrlDto, ...errors },
        },
      },
      async (req) => ({ url: await deps.subscriptions.portal(actorOf(req).userId) }),
    );

    // Num plugin próprio: conferir a assinatura exige o corpo exatamente como chegou.
    await app.register(async (raw) => {
      raw.removeAllContentTypeParsers();
      raw.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
        done(null, body);
      });
      raw.post('/v1/billing/webhook', { schema: { hide: true } }, async (req) => {
        const signature = req.headers['stripe-signature'];
        if (typeof signature !== 'string' || !Buffer.isBuffer(req.body)) {
          throw new AppError('VALIDATION_FAILED', 'Assinatura do webhook inválida.');
        }
        await deps.subscriptions.handleWebhook(req.body, signature);
        return { received: true };
      });
    });
  };
