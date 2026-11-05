import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';

export const resumeStatus = pgEnum('resume_status', ['generating', 'draft', 'failed']);

/** Currículo gerado. Só depois de aprovado poderá ser exportado (M-08). */
export const resumes = pgTable(
  'resumes',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: resumeStatus().notNull().default('generating'),
    content: jsonb().$type<unknown>(),
    /** Motivo da falha (código estável, sem conteúdo). */
    failureCode: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);
