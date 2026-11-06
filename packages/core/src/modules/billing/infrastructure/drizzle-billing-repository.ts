import { and, eq, schema, sql, withUserContext, type Database } from '@linkediner/db';
import type { FeatureKey } from '../../shared';
import { newId } from '../../shared';
import type { UsageRepository } from '../application/entitlements';
import type { SubscriptionRepository } from '../application/subscriptions';
import {
  grantsPlan,
  type Entitlement,
  type PlanKey,
  type PlanWithEntitlements,
  type SubscriptionEvent,
} from '../domain/plan';

const { billingEvents, planEntitlements, plans, subscriptions, usageRecords, users } = schema;

const refundKey = (key: string) => `${key}:refund`;

export class DrizzleUsageRepository implements UsageRepository {
  constructor(private readonly db: Database) {}

  planOf(userId: string): Promise<PlanWithEntitlements> {
    return withUserContext(this.db, userId, async (tx) => {
      const [current] = await tx
        .select({ planId: subscriptions.planId, status: subscriptions.status })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId));
      const plan =
        current && grantsPlan(current.status)
          ? await tx.select().from(plans).where(eq(plans.id, current.planId))
          : await tx
              .select()
              .from(plans)
              .where(and(eq(plans.key, 'free'), eq(plans.active, true)));
      const row = plan[0];
      if (!row) throw new Error('Plano não encontrado.');
      const entitlements = await tx
        .select()
        .from(planEntitlements)
        .where(eq(planEntitlements.planId, row.id));
      return {
        key: row.key as PlanKey,
        name: row.name,
        entitlements: entitlements.map((e): Entitlement => ({
          featureKey: e.featureKey as FeatureKey,
          limit: e.limitValue,
          period: e.period === 'month' ? 'month' : null,
        })),
      };
    });
  }

  usedInPeriod(userId: string, periodKey: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const rows = await tx
        .select({
          feature: usageRecords.featureKey,
          used: sql<number>`coalesce(sum(${usageRecords.quantity}), 0)::int`,
        })
        .from(usageRecords)
        .where(and(eq(usageRecords.userId, userId), eq(usageRecords.periodKey, periodKey)))
        .groupBy(usageRecords.featureKey);
      return new Map(rows.map((r) => [r.feature, r.used]));
    });
  }

  consume(userId: string, entry: Parameters<UsageRepository['consume']>[1]) {
    return withUserContext(this.db, userId, async (tx) => {
      // Dois pedidos ao mesmo tempo não podem passar do limite somando o mesmo saldo.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`usage:${userId}:${entry.feature}`}, 0))`,
      );
      const [sum] = await tx
        .select({ used: sql<number>`coalesce(sum(${usageRecords.quantity}), 0)::int` })
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.userId, userId),
            eq(usageRecords.featureKey, entry.feature),
            eq(usageRecords.periodKey, entry.periodKey),
          ),
        );
      const used = sum?.used ?? 0;
      const [existing] = await tx
        .select({ id: usageRecords.id })
        .from(usageRecords)
        .where(and(eq(usageRecords.userId, userId), eq(usageRecords.idempotencyKey, entry.key)));
      if (existing) return { allowed: true, used };
      if (used + 1 > entry.limit) return { allowed: false, used };
      await tx.insert(usageRecords).values({
        id: entry.id,
        userId,
        featureKey: entry.feature,
        quantity: 1,
        periodKey: entry.periodKey,
        idempotencyKey: entry.key,
      });
      return { allowed: true, used: used + 1 };
    });
  }

  async refund(userId: string, entry: Parameters<UsageRepository['refund']>[1]) {
    await withUserContext(this.db, userId, async (tx) => {
      const [original] = await tx
        .select()
        .from(usageRecords)
        .where(and(eq(usageRecords.userId, userId), eq(usageRecords.idempotencyKey, entry.key)));
      if (!original) return;
      await tx
        .insert(usageRecords)
        .values({
          id: entry.id,
          userId,
          featureKey: entry.feature,
          quantity: -original.quantity,
          periodKey: original.periodKey,
          idempotencyKey: refundKey(entry.key),
        })
        .onConflictDoNothing({ target: [usageRecords.userId, usageRecords.idempotencyKey] });
    });
  }
}

/** Usa o papel dono do banco: as assinaturas só mudam pelo webhook, que não tem usuário logado. */
export class DrizzleSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: Database) {}

  async emailOf(userId: string) {
    const [row] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    return row?.email ?? null;
  }

  async find(userId: string) {
    const [row] = await this.db
      .select({ sub: subscriptions, planKey: plans.key })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(eq(subscriptions.userId, userId));
    if (!row) return null;
    return {
      userId,
      planKey: row.planKey as PlanKey,
      status: row.sub.status,
      providerCustomerId: row.sub.providerCustomerId,
      providerSubscriptionId: row.sub.providerSubscriptionId,
      currentPeriodEnd: row.sub.currentPeriodEnd,
      cancelAtPeriodEnd: row.sub.cancelAtPeriodEnd,
    };
  }

  applyEvent(event: SubscriptionEvent, provider: string) {
    return this.db.transaction(async (tx) => {
      const claimed = await tx
        .insert(billingEvents)
        .values({ id: event.eventId })
        .onConflictDoNothing()
        .returning({ id: billingEvents.id });
      if (claimed.length === 0) return false;

      const [user] = await tx
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, event.userId))
        .for('update');
      if (!user || user.status !== 'active') return false;

      const [plan] = await tx
        .select({ id: plans.id })
        .from(plans)
        .where(and(eq(plans.key, event.planKey), eq(plans.active, true)));
      if (!plan) throw new Error('Plano da assinatura não encontrado.');

      const [current] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, event.userId));
      if (current) {
        if (current.lastEventAt > event.occurredAt) return false;
        // O fim de uma assinatura antiga não pode derrubar a que veio depois dela.
        const replaced = current.providerSubscriptionId !== event.providerSubscriptionId;
        if (replaced && !grantsPlan(event.status)) return false;
      }

      const fields = {
        planId: plan.id,
        status: event.status,
        provider,
        providerCustomerId: event.providerCustomerId,
        providerSubscriptionId: event.providerSubscriptionId,
        currentPeriodEnd: event.currentPeriodEnd,
        cancelAtPeriodEnd: event.cancelAtPeriodEnd,
        lastEventAt: event.occurredAt,
      };
      await tx
        .insert(subscriptions)
        .values({ id: newId(), userId: event.userId, ...fields })
        .onConflictDoUpdate({ target: subscriptions.userId, set: fields });
      return true;
    });
  }
}
