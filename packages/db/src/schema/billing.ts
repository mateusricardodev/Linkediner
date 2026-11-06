import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity';

/** Planos são dados: mudar limite não exige deploy (ADR 0010). O preço fica no provedor. */
export const plans = pgTable(
  'plans',
  {
    id: uuid().primaryKey(),
    key: text().notNull(),
    name: text().notNull(),
    version: integer().notNull().default(1),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex().on(t.key, t.version)],
);

/** `period` nulo: é um valor fixo (sim/não ou configuração), não um contador. */
export const planEntitlements = pgTable(
  'plan_entitlements',
  {
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    featureKey: text().notNull(),
    limitValue: integer().notNull(),
    period: text(),
  },
  (t) => [primaryKey({ columns: [t.planId, t.featureKey] })],
);

/** Uma assinatura por usuário, atualizada só pelo webhook do provedor. Sem linha: plano gratuito. */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: uuid()
      .notNull()
      .references(() => plans.id),
    status: text().notNull(),
    provider: text().notNull(),
    providerCustomerId: text().notNull(),
    providerSubscriptionId: text().notNull(),
    currentPeriodEnd: timestamp({ withTimezone: true }),
    cancelAtPeriodEnd: boolean().notNull().default(false),
    /** Eventos do provedor podem chegar fora de ordem: o mais antigo é ignorado. */
    lastEventAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex().on(t.userId), index().on(t.providerSubscriptionId)],
);

/** Consumo somente de inserção. O saldo é a soma do período, e o estorno é uma linha negativa. */
export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    featureKey: text().notNull(),
    quantity: integer().notNull(),
    periodKey: text().notNull(),
    idempotencyKey: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex().on(t.userId, t.idempotencyKey),
    index().on(t.userId, t.featureKey, t.periodKey),
  ],
);

/** Eventos do provedor já processados: o webhook pode chegar repetido. Não tem dado pessoal. */
export const billingEvents = pgTable('billing_events', {
  id: text().primaryKey(),
  processedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
