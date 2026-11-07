import {
  boolean,
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
import { seniority } from './profile';

export const remotePolicy = pgEnum('remote_policy', ['remote', 'hybrid', 'onsite', 'unknown']);

/** Liga ou desliga uma fonte sem deploy. Só fica ativa depois da revisão dos termos (ADR 0024). */
export const jobSources = pgTable('job_sources', {
  key: text().primaryKey(),
  status: text().notNull().default('disabled'),
  termsReviewedAt: timestamp({ withTimezone: true }),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Empresas acompanhadas. As fontes listam por empresa: não há busca geral. */
export const jobBoards = pgTable(
  'job_boards',
  {
    id: uuid().primaryKey().defaultRandom(),
    sourceKey: text()
      .notNull()
      .references(() => jobSources.key),
    token: text().notNull(),
    company: text().notNull(),
    enabled: boolean().notNull().default(true),
    lastSyncedAt: timestamp({ withTimezone: true }),
    /** Código estável da última falha, sem conteúdo. */
    lastError: text(),
  },
  (t) => [uniqueIndex().on(t.sourceKey, t.token)],
);

export const externalJobStructureStatus = pgEnum('external_job_structure_status', [
  'pending',
  'ready',
  'failed',
]);

/**
 * Catálogo de vagas públicas, compartilhado entre as pessoas (ADR 0024). Não guarda dado de ninguém.
 * Sai daqui quando a vaga some da listagem da empresa.
 */
export const externalJobs = pgTable(
  'external_jobs',
  {
    id: uuid().primaryKey(),
    boardId: uuid()
      .notNull()
      .references(() => jobBoards.id, { onDelete: 'cascade' }),
    externalId: text().notNull(),
    title: text().notNull(),
    company: text().notNull(),
    location: text().notNull(),
    remoteHint: boolean().notNull().default(false),
    applyUrl: text().notNull(),
    postedAt: timestamp({ withTimezone: true }),
    rawText: text().notNull(),
    /** Se o texto mudar, a vaga é analisada de novo. */
    contentHash: text().notNull(),
    structureStatus: externalJobStructureStatus().notNull().default('pending'),
    employmentType: text(),
    salaryText: text(),
    remotePolicy: remotePolicy(),
    seniority: seniority(),
    mustHave: jsonb().$type<string[]>().notNull().default([]),
    niceToHave: jsonb().$type<string[]>().notNull().default([]),
    /** Quem gerou a análise: toda geração registra modelo e versão do prompt. */
    model: text(),
    promptVersion: integer(),
    firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex().on(t.boardId, t.externalId),
    index().on(t.postedAt),
    index().on(t.structureStatus),
  ],
);
