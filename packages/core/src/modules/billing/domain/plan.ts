import type { Clock, FeatureKey } from '../../shared';

export const PAID_PLANS = ['pro', 'advanced'] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
export type PlanKey = 'free' | PaidPlan;

export interface Entitlement {
  featureKey: FeatureKey;
  limit: number;
  /** Nulo: valor fixo (sim/não ou configuração), não um contador. */
  period: 'month' | null;
}

export interface PlanWithEntitlements {
  key: PlanKey;
  name: string;
  entitlements: Entitlement[];
}

/** Só estes status dão direito ao plano pago. `past_due`: o provedor ainda está tentando cobrar. */
export const GRANTING_STATUSES: readonly string[] = ['active', 'trialing', 'past_due'];
export const grantsPlan = (status: string) => GRANTING_STATUSES.includes(status);

/** Período mensal em UTC. */
export function periodOf(now: Date): { key: string; resetsAt: Date } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    resetsAt: new Date(Date.UTC(year, month + 1, 1)),
  };
}

export const currentPeriod = (clock: Clock) => periodOf(clock.now());

export interface FeatureUsage {
  feature: FeatureKey;
  limit: number;
  /** Nulo: valor fixo, sem contador. */
  used: number | null;
  remaining: number | null;
  resetsAt: Date | null;
}

export function describeUsage(
  entitlements: Entitlement[],
  used: ReadonlyMap<string, number>,
  resetsAt: Date,
): FeatureUsage[] {
  return entitlements.map(({ featureKey, limit, period }) => {
    if (period === null) {
      return { feature: featureKey, limit, used: null, remaining: null, resetsAt: null };
    }
    const spent = used.get(featureKey) ?? 0;
    return {
      feature: featureKey,
      limit,
      used: spent,
      remaining: Math.max(limit - spent, 0),
      resetsAt,
    };
  });
}

export interface Subscription {
  userId: string;
  planKey: PlanKey;
  status: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/** Mudança de assinatura, já traduzida do formato do provedor. */
export interface SubscriptionEvent {
  eventId: string;
  occurredAt: Date;
  userId: string;
  planKey: PaidPlan;
  status: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}
