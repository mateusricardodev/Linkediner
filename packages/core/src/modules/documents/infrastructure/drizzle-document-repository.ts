import { and, asc, eq, schema, sql, withUserContext, type Database } from '@linkediner/db';
import type { DocumentRecord, DocumentStatus } from '../domain/document';
import type {
  DocumentRepository,
  DocumentRetentionRepository,
} from '../application/ports/document-repository';

const { documents } = schema;

const toRecord = (r: typeof documents.$inferSelect): DocumentRecord => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  objectKey: r.objectKey,
  mimeType: r.mimeType,
  sizeBytes: r.sizeBytes,
  sha256: r.sha256,
  uploadedAt: r.uploadedAt,
  expiresAt: r.expiresAt,
  createdAt: r.createdAt,
});

export class DrizzleDocumentRepository implements DocumentRepository {
  constructor(private readonly db: Database) {}

  insert(userId: string, doc: Parameters<DocumentRepository['insert']>[1]) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .insert(documents)
        .values({ ...doc, userId })
        .returning();
      return toRecord(row!);
    });
  }

  find(userId: string, id: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.id, id), eq(documents.userId, userId)));
      return row ? toRecord(row) : null;
    });
  }

  list(userId: string) {
    return withUserContext(this.db, userId, async (tx) =>
      (
        await tx
          .select()
          .from(documents)
          .where(eq(documents.userId, userId))
          .orderBy(asc(documents.createdAt))
      ).map(toRecord),
    );
  }

  markUploaded(
    userId: string,
    id: string,
    data: { sha256: string; sizeBytes: number; uploadedAt: Date },
  ) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .update(documents)
        .set({ ...data, status: 'uploaded' })
        .where(and(eq(documents.id, id), eq(documents.userId, userId)))
        .returning();
      return toRecord(row!);
    });
  }

  async setStatus(userId: string, id: string, status: DocumentStatus) {
    await withUserContext(this.db, userId, (tx) =>
      tx
        .update(documents)
        .set({ status })
        .where(and(eq(documents.id, id), eq(documents.userId, userId))),
    );
  }

  delete(userId: string, id: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const rows = await tx
        .delete(documents)
        .where(and(eq(documents.id, id), eq(documents.userId, userId)))
        .returning({ id: documents.id });
      return rows.length > 0;
    });
  }
}

/** Retenção (worker): roda com o papel dono do banco, sem contexto de usuário. */
export class DrizzleDocumentRetentionRepository implements DocumentRetentionRepository {
  constructor(private readonly db: Database) {}

  findExpired(now: Date, pendingBefore: Date, limit: number) {
    return this.db
      .select({ id: documents.id, userId: documents.userId, objectKey: documents.objectKey })
      .from(documents)
      .where(
        sql`${documents.expiresAt} <= ${now.toISOString()} OR (${documents.status} = 'pending_upload' AND ${documents.createdAt} <= ${pendingBefore.toISOString()})`,
      )
      .limit(limit);
  }

  async deleteById(id: string) {
    await this.db.delete(documents).where(eq(documents.id, id));
  }
}
