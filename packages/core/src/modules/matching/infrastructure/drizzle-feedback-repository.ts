import { and, asc, eq, schema, withUserContext, type Database } from '@linkediner/db';
import { newId } from '../../shared';
import type { FeedbackRecord, JobSnapshot } from '../domain/preferences';
import type { FeedbackRepository } from '../application/feedback-service';

const { jobFeedback } = schema;

export class DrizzleFeedbackRepository implements FeedbackRepository {
  constructor(private readonly db: Database) {}

  list(userId: string) {
    return withUserContext(this.db, userId, async (tx) =>
      (
        await tx
          .select()
          .from(jobFeedback)
          .where(eq(jobFeedback.userId, userId))
          .orderBy(asc(jobFeedback.createdAt), asc(jobFeedback.id))
      ).map((r): FeedbackRecord => ({
        jobId: r.jobId,
        reason: r.reason,
        snapshot: r.jobSnapshot as JobSnapshot,
      })),
    );
  }

  async replace(userId: string, jobId: string, records: FeedbackRecord[]) {
    await withUserContext(this.db, userId, async (tx) => {
      await tx
        .delete(jobFeedback)
        .where(and(eq(jobFeedback.userId, userId), eq(jobFeedback.jobId, jobId)));
      if (records.length) {
        await tx.insert(jobFeedback).values(
          records.map((r) => ({
            id: newId(),
            userId,
            jobId,
            reason: r.reason,
            jobSnapshot: r.snapshot,
          })),
        );
      }
    });
  }
}
