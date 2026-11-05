import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { documents } from './documents';
import { users } from './identity';
import { profiles } from './profile';

export const factType = pgEnum('fact_type', [
  'experience',
  'skill',
  'project',
  'education',
  'certification',
  'language',
  'achievement',
]);

/**
 * extracted: veio de um documento, com trecho comprovado. user_confirmed: confirmado ou editado pelo usuário.
 * suggested: sem comprovação, aguarda confirmação. rejected: recusado pelo usuário, não volta a ser sugerido.
 */
export const factVerification = pgEnum('fact_verification', [
  'extracted',
  'user_confirmed',
  'suggested',
  'rejected',
]);

/**
 * Fatos do perfil: base da regra anti-invenção (docs/arquitetura/05-ia-e-documentos.md).
 * `fingerprint` evita duplicar o mesmo fato vindo de documentos diferentes e impede que um fato recusado volte.
 * Quando o documento expira, o fato permanece (`source_document_id` fica nulo). Quando o usuário apaga
 * o documento, os fatos não confirmados são removidos junto.
 */
export const profileFacts = pgTable(
  'profile_facts',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    type: factType().notNull(),
    data: jsonb().$type<Record<string, unknown>>().notNull(),
    fingerprint: text().notNull(),
    sourceDocumentId: uuid().references(() => documents.id, { onDelete: 'set null' }),
    sourceSpan: text(),
    verification: factVerification().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index().on(t.userId),
    index().on(t.sourceDocumentId),
    uniqueIndex().on(t.profileId, t.fingerprint),
  ],
);

/**
 * Registro de cada geração de IA: provedor, modelo, versão do prompt e resultado (ADR 0004).
 * O hash é do texto já sem dados pessoais. Retenção de 90 dias.
 */
export const aiGenerations = pgTable(
  'ai_generations',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    task: text().notNull(),
    provider: text().notNull(),
    model: text().notNull(),
    promptId: text().notNull(),
    promptVersion: integer().notNull(),
    inputHash: text().notNull(),
    output: jsonb().$type<unknown>().notNull(),
    validation: jsonb().$type<Record<string, unknown>>().notNull(),
    tokensIn: integer().notNull(),
    tokensOut: integer().notNull(),
    latencyMs: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.createdAt)],
);
