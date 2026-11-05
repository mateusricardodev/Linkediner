import { index, jsonb, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { jobs } from './jobs';

export const feedbackReason = pgEnum('feedback_reason', [
  'liked',
  'disliked',
  'too_senior',
  'misaligned',
  'salary_mismatch',
  'location_mismatch',
  'tech_mismatch',
  'company_blocked',
  'already_applied',
  'more_like_this',
]);

/**
 * Avaliação de uma vaga. As preferências são calculadas a partir destas linhas, então apagar ou
 * mudar uma avaliação já muda as recomendações. `job_snapshot` guarda o necessário para aprender
 * mesmo depois que a vaga for apagada: empresa, nível, modelo de trabalho e termos dos requisitos.
 */
export const jobFeedback = pgTable(
  'job_feedback',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobId: uuid().references(() => jobs.id, { onDelete: 'set null' }),
    reason: feedbackReason().notNull(),
    jobSnapshot: jsonb().$type<unknown>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId), index().on(t.jobId)],
);
