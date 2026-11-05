import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const userStatus = pgEnum('user_status', ['active', 'pending_deletion', 'deleted']);

export const users = pgTable('users', {
  id: uuid().primaryKey(),
  email: text().notNull().unique(),
  name: text(),
  locale: text().notNull().default('pt-BR'),
  timezone: text().notNull().default('America/Sao_Paulo'),
  dataRegion: text().notNull().default('br'),
  status: userStatus().notNull().default('active'),
  ...timestamps,
});

/** Finalidades de consentimento (docs/arquitetura/07-seguranca-e-privacidade.md). */
export const consentPurpose = pgEnum('consent_purpose', [
  'terms',
  'privacy',
  'ai_processing',
  'auto_apply',
  'marketing',
  'model_training',
]);

/** Cada concessão ou revogação é uma nova linha: o histórico nunca é sobrescrito. */
export const consents = pgTable(
  'consents',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: consentPurpose().notNull(),
    version: text().notNull(),
    granted: boolean().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.purpose, t.createdAt)],
);

export const actorType = pgEnum('actor_type', ['user', 'system', 'admin']);

/**
 * Auditoria somente de inserção. `metadata` nunca contém dados pessoais.
 * `actorId` é pseudonimizado depois da exclusão do usuário (ADR 0008), por isso não tem FK.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid().primaryKey(),
    actorType: actorType().notNull(),
    actorId: text(),
    action: text().notNull(),
    entityType: text(),
    entityId: text(),
    metadata: jsonb()
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ipHash: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.actorId, t.createdAt), index().on(t.entityType, t.entityId)],
);
