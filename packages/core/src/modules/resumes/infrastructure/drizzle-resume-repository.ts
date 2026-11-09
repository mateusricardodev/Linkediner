import { and, asc, eq, schema, withUserContext, type Database } from '@linkediner/db';
import type { FieldCipher, UserCipher } from '../../crypto';
import type { Resume, ResumeContent, ResumeOptions } from '../domain/resume';
import type { ResumeRepository } from '../application/ports/resume-repository';

const { resumes } = schema;

const CONTENT = 'resumes.content';

const toResume = (c: UserCipher, r: typeof resumes.$inferSelect): Resume => ({
  id: r.id,
  status: r.status,
  language: r.language === 'en' ? 'en' : 'pt',
  jobId: r.jobId,
  content: c.openJson<ResumeContent | null>(CONTENT, r.content) ?? null,
  failureCode: r.failureCode,
  approvedAt: r.approvedAt,
  createdAt: r.createdAt,
});

export class DrizzleResumeRepository implements ResumeRepository {
  constructor(
    private readonly db: Database,
    private readonly cipher: FieldCipher,
  ) {}

  private owned(userId: string, id: string) {
    return and(eq(resumes.id, id), eq(resumes.userId, userId));
  }

  async insertGenerating(userId: string, id: string, options: ResumeOptions) {
    const c = await this.cipher.forUser(userId);
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .insert(resumes)
        .values({ id, userId, language: options.language, jobId: options.jobId })
        .returning();
      return toResume(c, row!);
    });
  }

  async find(userId: string, id: string) {
    const c = await this.cipher.forUser(userId);
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx.select().from(resumes).where(this.owned(userId, id));
      return row ? toResume(c, row) : null;
    });
  }

  async list(userId: string) {
    const c = await this.cipher.forUser(userId);
    return withUserContext(this.db, userId, async (tx) =>
      (
        await tx
          .select()
          .from(resumes)
          .where(eq(resumes.userId, userId))
          .orderBy(asc(resumes.createdAt), asc(resumes.id))
      ).map((row) => toResume(c, row)),
    );
  }

  async saveDraft(userId: string, id: string, content: ResumeContent) {
    const c = await this.cipher.forUser(userId);
    await withUserContext(this.db, userId, (tx) =>
      tx
        .update(resumes)
        .set({ status: 'draft', content: c.sealJson(CONTENT, content), failureCode: null })
        .where(this.owned(userId, id)),
    );
  }

  async markFailed(userId: string, id: string, failureCode: string) {
    await withUserContext(this.db, userId, (tx) =>
      tx.update(resumes).set({ status: 'failed', failureCode }).where(this.owned(userId, id)),
    );
  }

  async approve(userId: string, id: string, at: Date) {
    const c = await this.cipher.forUser(userId);
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .update(resumes)
        .set({ status: 'approved', approvedAt: at })
        .where(and(this.owned(userId, id), eq(resumes.status, 'draft')))
        .returning();
      return row ? toResume(c, row) : null;
    });
  }

  async updateContent(userId: string, id: string, change: (content: ResumeContent) => void) {
    const c = await this.cipher.forUser(userId);
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx.select().from(resumes).where(this.owned(userId, id)).for('update');
      if (!row?.content) return null;
      const content = c.openJson<ResumeContent>(CONTENT, row.content);
      change(content);
      const [updated] = await tx
        .update(resumes)
        .set({
          content: c.sealJson(CONTENT, content),
          ...(row.status === 'approved' ? { status: 'draft' as const, approvedAt: null } : {}),
        })
        .where(this.owned(userId, id))
        .returning();
      return toResume(c, updated!);
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
