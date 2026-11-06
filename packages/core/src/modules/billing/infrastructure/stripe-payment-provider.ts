import Stripe from 'stripe';
import type { PaymentProvider } from '../application/subscriptions';
import type { PaidPlan, SubscriptionEvent } from '../domain/plan';

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  prices: Record<PaidPlan, string>;
}

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

/** Pagamento em página hospedada pela Stripe: o cartão nunca passa pela aplicação. */
export class StripePaymentProvider implements PaymentProvider {
  readonly id = 'stripe';
  private readonly client: Stripe;
  private readonly planByPrice: Map<string, PaidPlan>;

  constructor(private readonly config: StripeConfig) {
    this.client = new Stripe(config.secretKey);
    this.planByPrice = new Map(
      (Object.entries(config.prices) as [PaidPlan, string][]).map(([plan, price]) => [price, plan]),
    );
  }

  async createCheckout(input: Parameters<PaymentProvider['createCheckout']>[0]) {
    const session = await this.client.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: this.config.prices[input.plan], quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.userId,
      subscription_data: { metadata: { userId: input.userId } },
      ...(input.customerId ? { customer: input.customerId } : { customer_email: input.email }),
    });
    if (!session.url) throw new Error('A Stripe não devolveu a URL de pagamento.');
    return session.url;
  }

  async createPortal(customerId: string, returnUrl: string) {
    const session = await this.client.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return session.url;
  }

  parseWebhook(rawBody: Buffer, signature: string): SubscriptionEvent | null {
    const event = this.client.webhooks.constructEvent(
      rawBody,
      signature,
      this.config.webhookSecret,
    );
    if (!SUBSCRIPTION_EVENTS.has(event.type)) return null;

    const subscription = event.data.object as Stripe.Subscription;
    const item = subscription.items.data[0];
    const plan = item ? this.planByPrice.get(item.price.id) : undefined;
    const userId = subscription.metadata.userId;
    // Assinatura de outro produto da mesma conta Stripe: não é nossa.
    if (!plan || !userId) return null;
    return {
      eventId: event.id,
      occurredAt: new Date(event.created * 1000),
      userId,
      planKey: plan,
      status: subscription.status,
      providerCustomerId:
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id,
      providerSubscriptionId: subscription.id,
      currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };
  }

  async deleteCustomer(customerId: string) {
    try {
      await this.client.customers.del(customerId);
    } catch (error) {
      if ((error as { code?: string }).code !== 'resource_missing') throw error;
    }
  }
}

/** Sem a configuração, o produto funciona só com o plano gratuito. */
export function createPaymentProvider(config: {
  STRIPE_SECRET_KEY?: string | undefined;
  STRIPE_WEBHOOK_SECRET?: string | undefined;
  STRIPE_PRICE_PRO?: string | undefined;
  STRIPE_PRICE_ADVANCED?: string | undefined;
}): PaymentProvider | null {
  const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO, STRIPE_PRICE_ADVANCED } =
    config;
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !STRIPE_PRICE_PRO || !STRIPE_PRICE_ADVANCED) {
    return null;
  }
  return new StripePaymentProvider({
    secretKey: STRIPE_SECRET_KEY,
    webhookSecret: STRIPE_WEBHOOK_SECRET,
    prices: { pro: STRIPE_PRICE_PRO, advanced: STRIPE_PRICE_ADVANCED },
  });
}
