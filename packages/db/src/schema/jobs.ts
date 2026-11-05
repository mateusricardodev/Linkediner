import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { seniority } from './profile';

export const jobStatus = pgEnum('job_status', ['structuring', 'ready', 'failed']);
export const remotePolicy = pgEnum('remote_policy', ['remote', 'hybrid', 'onsite', 'unknown']);

/**
 * Vaga importada. Pertence a quem importou: o texto colado por uma pessoa nunca aparece para outra (ADR 0015).
 * `apply_url` é só uma referência para o usuário abrir. O sistema nunca acessa esse link.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: text().notNull().default('manual'),
    status: jobStatus().notNull().default('structuring'),
    /** Motivo da falha (código estável, sem conteúdo). */
    failureCode: text(),
    rawText: text().notNull(),
    applyUrl: text(),
    /** Evita importar a mesma vaga duas vezes. Calculado sobre o texto normalizado. */
    dedupeHash: text().notNull(),
    title: text(),
    company: text(),
    location: text(),
    employmentType: text(),
    /** Faixa salarial como está escrita na vaga. */
    salaryText: text(),
    remotePolicy: remotePolicy(),
    seniority: seniority(),
    mustHave: jsonb().$type<string[]>().notNull().default([]),
    niceToHave: jsonb().$type<string[]>().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.userId, t.createdAt), uniqueIndex().on(t.userId, t.dedupeHash)],
);
