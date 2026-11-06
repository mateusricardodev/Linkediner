import { jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { applications } from './applications';
import { users } from './identity';

export const materialKind = pgEnum('material_kind', ['resume', 'cover_letter', 'form_answers']);
export const materialStatus = pgEnum('material_status', ['generating', 'ready', 'failed']);

/**
 * Material gerado para uma vaga. Um por tipo em cada candidatura: gerar de novo substitui.
 * Só pode ser alterado com a candidatura em revisão, então fica congelado depois da aprovação.
 */
export const applicationMaterials = pgTable(
  'application_materials',
  {
    id: uuid().primaryKey(),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: materialKind().notNull(),
    status: materialStatus().notNull().default('generating'),
    /** Perguntas do formulário, quando o tipo é form_answers. */
    questions: jsonb().$type<string[]>().notNull().default([]),
    content: jsonb().$type<unknown>(),
    /** Motivo da falha (código estável, sem conteúdo). */
    failureCode: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex().on(t.applicationId, t.kind)],
);
