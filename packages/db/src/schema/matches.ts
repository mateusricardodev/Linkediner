import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { jobs } from './jobs';
import { careerGoals } from './profile';

/**
 * Último cálculo de compatibilidade entre o usuário e a vaga. `score` fica nulo quando a vaga não
 * traz requisitos suficientes: um número nesse caso não diria nada.
 */
export const jobMatches = pgTable(
  'job_matches',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobId: uuid()
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    careerGoalId: uuid().references(() => careerGoals.id, { onDelete: 'set null' }),
    score: integer(),
    rubricVersion: text().notNull(),
    factors: jsonb().$type<unknown>().notNull(),
    calculatedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex().on(t.userId, t.jobId)],
);
