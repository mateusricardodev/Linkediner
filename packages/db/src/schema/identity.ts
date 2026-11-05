import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

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
  emailVerified: boolean().notNull().default(false),
  name: text(),
  image: text(),
  locale: text().notNull().default('pt-BR'),
  timezone: text().notNull().default('America/Sao_Paulo'),
  dataRegion: text().notNull().default('br'),
  status: userStatus().notNull().default('active'),
  ...timestamps,
});

/**
 * Tabelas de autenticação, no formato esperado pelo Better Auth (ADR 0009).
 * Acessadas só pelo módulo identity com o papel dono do banco: o papel da aplicação não tem permissão nelas.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    /** Guardamos só o hash do IP (docs/arquitetura/03-dados.md). */
    ipAddress: text(),
    userAgent: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

/**
 * Identidades de login (OAuth ou senha). Tokens de provedores externos não são guardados:
 * só precisamos da identidade (ADR 0009). `password` guarda apenas o hash Argon2id.
 */
export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: text().notNull(),
    accountId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId), uniqueIndex().on(t.providerId, t.accountId)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: uuid().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.identifier)],
);

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
