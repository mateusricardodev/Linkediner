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
import { jobs } from './jobs';
import { resumes } from './resumes';

export const applicationState = pgEnum('application_state', [
  'recommended',
  'saved',
  'analyzing',
  'in_review',
  'awaiting_approval',
  'approved',
  'sending',
  'sent',
  'failed',
  'blocked_by_source',
  'manual_action_required',
  'interview_received',
  'rejected',
  'closed',
]);

export const submissionMode = pgEnum('submission_mode', ['api', 'assisted', 'manual']);
export const applicationActor = pgEnum('application_actor', ['user', 'system', 'source']);

/**
 * Candidatura. `job_snapshot` mantém o histórico legível depois que a vaga for apagada.
 * `material_snapshot` é o currículo exatamente como aprovado: é ele que vai para a candidatura.
 */
export const applications = pgTable(
  'applications',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobId: uuid().references(() => jobs.id, { onDelete: 'set null' }),
    jobSnapshot: jsonb().$type<unknown>().notNull(),
    state: applicationState().notNull(),
    resumeId: uuid().references(() => resumes.id, { onDelete: 'set null' }),
    materialSnapshot: jsonb().$type<unknown>(),
    submissionMode: submissionMode(),
    submittedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex().on(t.userId, t.jobId), index().on(t.userId, t.state)],
);

/** Histórico imutável: cada mudança de estado vira uma linha. */
export const applicationEvents = pgTable(
  'application_events',
  {
    id: uuid().primaryKey(),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fromState: applicationState(),
    toState: applicationState().notNull(),
    actor: applicationActor().notNull(),
    /** Código estável, sem dados pessoais. */
    reason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.applicationId, t.createdAt)],
);

/** Pendência de preenchimento manual, quando a fonte não tem integração autorizada. */
export const manualTasks = pgTable(
  'manual_tasks',
  {
    id: uuid().primaryKey(),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text().notNull(),
    resolvedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.applicationId), index().on(t.userId, t.resolvedAt)],
);
