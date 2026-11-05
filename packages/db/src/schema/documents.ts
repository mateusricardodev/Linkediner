import { bigint, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';

export const documentKind = pgEnum('document_kind', ['resume', 'linkedin_pdf']);

/**
 * pending_upload → uploaded → (processing → processed | failed, na extração M-05)
 * Documentos expiram em 30 dias (ADR 0008): o arquivo é apagado e o registro removido.
 */
export const documentStatus = pgEnum('document_status', [
  'pending_upload',
  'uploaded',
  'processing',
  'processed',
  'failed',
]);

export const documents = pgTable(
  'documents',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: documentKind().notNull(),
    status: documentStatus().notNull().default('pending_upload'),
    objectKey: text().notNull().unique(),
    mimeType: text().notNull(),
    sizeBytes: bigint({ mode: 'number' }).notNull(),
    sha256: text(),
    /** Motivo da falha na extração (código estável, sem conteúdo do documento). */
    failureCode: text(),
    uploadedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.expiresAt)],
);
