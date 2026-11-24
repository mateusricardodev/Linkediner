import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { documents } from './documents';
import { users } from './identity';

export const linkedinAnalysisStatus = pgEnum('linkedin_analysis_status', [
  'processing',
  'ready',
  'failed',
]);

/**
 * Análise do perfil do LinkedIn a partir do PDF que a pessoa enviou (ADR 0034). O resultado tem
 * trechos do perfil: fica criptografado por usuário. A análise continua depois que o PDF expira.
 */
export const linkedinAnalyses = pgTable(
  'linkedin_analyses',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    documentId: uuid().references(() => documents.id, { onDelete: 'set null' }),
    status: linkedinAnalysisStatus().notNull().default('processing'),
    /** Motivo da falha (código estável, sem conteúdo). */
    failureCode: text(),
    /** Nota geral, fora do resultado criptografado para listar sem abrir cada análise. */
    score: integer(),
    result: jsonb().$type<unknown>(),
    /** Cargo do objetivo ativo, usado como alvo das palavras-chave. */
    targetRole: text(),
    /** Ações do checklist que a pessoa marcou como feitas. */
    doneActions: text().array().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);
