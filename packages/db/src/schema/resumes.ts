import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { jobs } from './jobs';

export const resumeStatus = pgEnum('resume_status', ['generating', 'draft', 'approved', 'failed']);

/** Currículo gerado. Só depois de aprovado pode ser exportado. Editar exige aprovar de novo. */
export const resumes = pgTable(
  'resumes',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: resumeStatus().notNull().default('generating'),
    /** Idioma em que o currículo é escrito: pt ou en. */
    language: text().notNull().default('pt'),
    /** Vaga que orientou o que destacar. Nula no currículo geral. Apagar a vaga não apaga o currículo. */
    jobId: uuid().references(() => jobs.id, { onDelete: 'set null' }),
    content: jsonb().$type<unknown>(),
    /** Motivo da falha (código estável, sem conteúdo). */
    failureCode: text(),
    approvedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);
