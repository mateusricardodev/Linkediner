import { and, asc, eq, schema, withUserContext, type Database } from '@linkediner/db';
import type { Resume, ResumeContent } from '../domain/resume';
import type { ResumeRepository } from '../application/ports/resume-repository';

const { resumes } = schema;

const toResume = (r: typeof resumes.$inferSelect): Resume => ({
  id: r.id,
  status: r.status,
  content: (r.content as ResumeContent | null) ?? null,
  failureCode: r.failureCode,
  createdAt: r.createdAt,
});

export class DrizzleResumeRepository implements ResumeRepository {
  constructor(private readonly db: Database) {}

  private owned(userId: string, id: string) {
    return and(eq(resumes.id, id), eq(resumes.userId, userId));
  }

  insertGenerating(userId: string, id: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx.insert(resumes).values({ id, userId }).returning();
      return toResume(row!);
    });
  }

  find(userId: string, id: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx.select().from(resumes).where(this.owned(userId, id));
      return row ? toResume(row) : null;
    });
  }

  list(userId: string) {
    return withUserContext(this.db, userId, async (tx) =>
      (
        await tx
          .select()
          .from(resumes)
          .where(eq(resumes.userId, userId))
          .orderBy(asc(resumes.createdAt), asc(resumes.id))
      ).map(toResume),
    );
  }

  async saveDraft(userId: string, id: string, content: ResumeContent) {
    await withUserContext(this.db, userId, (tx) =>
      tx
        .update(resumes)
        .set({ status: 'draft', content, failureCode: null })
        .where(this.owned(userId, id)),
    );
  }

  async markFailed(userId: string, id: string, failureCode: string) {
    await withUserContext(this.db, userId, (tx) =>
      tx.update(resumes).set({ status: 'failed', failureCode }).where(this.owned(userId, id)),
    );
  }

  updateContent(userId: string, id: string, change: (content: ResumeContent) => void) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx.select().from(resumes).where(this.owned(userId, id)).for('update');
      if (!row?.content) return null;
      const content = row.content as ResumeContent;
      change(content);
      const [updated] = await tx
        .update(resumes)
        .set({ content })
        .where(this.owned(userId, id))
        .returning();
      return toResume(updated!);
    });
  }

  delete(userId: string, id: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const rows = await tx
        .delete(resumes)
        .where(this.owned(userId, id))
        .returning({ id: resumes.id });
      return rows.length > 0;
    });
  }
}
