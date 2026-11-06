import {
  bigint,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './identity';

export const deletionStatus = pgEnum('deletion_status', ['pending', 'completed', 'failed']);

/**
 * Rastreia a exclusão da conta (ADR 0019). Sobrevive ao expurgo: `user_id` fica nulo e sobra só o
 * pseudônimo, igual ao da auditoria. O relatório tem apenas contagens. Sem acesso do papel da aplicação.
 */
export const deletionRequests = pgTable(
  'deletion_requests',
  {
    id: uuid().primaryKey(),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    userRef: text().notNull(),
    status: deletionStatus().notNull().default('pending'),
    report: jsonb().$type<Record<string, number>>(),
    requestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex().on(t.userId), index().on(t.status, t.requestedAt)],
);

export const dataExportStatus = pgEnum('data_export_status', ['pending', 'ready', 'failed']);

/** Exportação dos dados do titular (LGPD). O arquivo expira em 7 dias. */
export const dataExports = pgTable(
  'data_exports',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: dataExportStatus().notNull().default('pending'),
    objectKey: text(),
    sizeBytes: bigint({ mode: 'number' }),
    failureCode: text(),
    expiresAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.expiresAt)],
);
