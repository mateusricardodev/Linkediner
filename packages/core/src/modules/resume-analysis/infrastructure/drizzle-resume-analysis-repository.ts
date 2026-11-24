import { and, desc, eq, schema, withUserContext, type Database } from '@linkediner/db';
import type { FieldCipher, UserCipher } from '../../crypto';
import type { AnalysisResult, ResumeAnalysis } from '../domain/analysis';
import type { ResumeAnalysisRepository } from '../application/ports';

const { resumeAnalyses } = schema;

const RESULT = 'resume_analyses.result';

const toAnalysis = (c: UserCipher, r: typeof resumeAnalyses.$inferSelect): ResumeAnalysis => ({
  id: r.id,
  documentId: r.documentId,
  status: r.status,
  failureCode: r.failureCode,
  targetRole: r.targetRole,
  result: c.openJson<AnalysisResult | null>(RESULT, r.result) ?? null,
  doneActions: r.doneActions,
  createdAt: r.createdAt,
});

export class DrizzleResumeAnalysisRepository implements ResumeAnalysisRepository {
  constructor(
    private readonly db: Database,
    private readonly cipher: FieldCipher,
  ) {}

  private owned(userId: string, id: string) {
    return and(eq(resumeAnalyses.id, id), eq(resumeAnalyses.userId, userId));
  }

  async insertProcessing(
    userId: string,
    analysis: { id: string; documentId: string; targetRole: string | null },
  ) {
    const c = await this.cipher.forUser(userId);
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .insert(resumeAnalyses)
        .values({ ...analysis, userId })
        .returning();
      return toAnalysis(c, row!);
    });
  }

  async find(userId: string, id: string) {
    const c = await this.cipher.forUser(userId);
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx.select().from(resumeAnalyses).where(this.owned(userId, id));
      return row ? toAnalysis(c, row) : null;
    });
  }

  async list(userId: string) {
    const c = await this.cipher.forUser(userId);
    return withUserContext(this.db, userId, async (tx) =>
      (
        await tx
          .select()
          .from(resumeAnalyses)
          .where(eq(resumeAnalyses.userId, userId))
          .orderBy(desc(resumeAnalyses.createdAt), desc(resumeAnalyses.id))
      ).map((row) => toAnalysis(c, row)),
    );
  }

  async saveReady(userId: string, id: string, result: AnalysisResult) {
    const c = await this.cipher.forUser(userId);
    await withUserContext(this.db, userId, (tx) =>
      tx
        .update(resumeAnalyses)
        .set({
          status: 'ready',
          failureCode: null,
          score: result.score,
          result: c.sealJson(RESULT, result),
        })
        .where(this.owned(userId, id)),
    );
  }

  async markFailed(userId: string, id: string, failureCode: string) {
    await withUserContext(this.db, userId, (tx) =>
      tx
        .update(resumeAnalyses)
        .set({ status: 'failed', failureCode })
        .where(this.owned(userId, id)),
    );
  }

  async setDoneActions(userId: string, id: string, doneActions: string[]) {
    await withUserContext(this.db, userId, (tx) =>
      tx.update(resumeAnalyses).set({ doneActions }).where(this.owned(userId, id)),
    );
  }
}
