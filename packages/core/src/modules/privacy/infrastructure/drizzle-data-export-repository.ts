import { and, asc, desc, eq, lt, schema, withUserContext, type Database } from '@linkediner/db';
import type { DataExportRepository } from '../application/data-export';
import type { DataExport } from '../domain/account-data';

const { dataExports } = schema;

const toExport = (r: typeof dataExports.$inferSelect): DataExport => ({
  id: r.id,
  userId: r.userId,
  status: r.status,
  objectKey: r.objectKey,
  sizeBytes: r.sizeBytes,
  expiresAt: r.expiresAt,
  createdAt: r.createdAt,
});

export class DrizzleDataExportRepository implements DataExportRepository {
  constructor(private readonly db: Database) {}

  private owned(userId: string, id: string) {
    return and(eq(dataExports.id, id), eq(dataExports.userId, userId));
  }

  insert(userId: string, id: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx.insert(dataExports).values({ id, userId }).returning();
      return toExport(row!);
    });
  }

  find(userId: string, id: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx.select().from(dataExports).where(this.owned(userId, id));
      return row ? toExport(row) : null;
    });
  }

  list(userId: string) {
    return withUserContext(this.db, userId, async (tx) =>
      (
        await tx
          .select()
          .from(dataExports)
          .where(eq(dataExports.userId, userId))
          .orderBy(desc(dataExports.createdAt), desc(dataExports.id))
      ).map(toExport),
    );
  }

  markReady(
    userId: string,
    id: string,
    file: { objectKey: string; sizeBytes: number; expiresAt: Date },
  ) {
    return withUserContext(this.db, userId, async (tx) => {
      const rows = await tx
        .update(dataExports)
        .set({ status: 'ready', failureCode: null, ...file })
        .where(this.owned(userId, id))
        .returning({ id: dataExports.id });
      return rows.length > 0;
    });
  }

  async markFailed(userId: string, id: string, failureCode: string) {
    await withUserContext(this.db, userId, (tx) =>
      tx.update(dataExports).set({ status: 'failed', failureCode }).where(this.owned(userId, id)),
    );
  }

  async findExpired(now: Date, limit: number) {
    const rows = await this.db
      .select()
      .from(dataExports)
      .where(lt(dataExports.expiresAt, now))
      .orderBy(asc(dataExports.expiresAt))
      .limit(limit);
    return rows.map(toExport);
  }

  async deleteById(id: string) {
    await this.db.delete(dataExports).where(eq(dataExports.id, id));
  }
}
