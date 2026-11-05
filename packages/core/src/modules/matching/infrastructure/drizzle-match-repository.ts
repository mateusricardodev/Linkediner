import { schema, withUserContext, type Database } from '@linkediner/db';
import { newId } from '../../shared';
import type { JobMatchRecord, MatchRepository } from '../application/matching-service';

const { jobMatches } = schema;

export class DrizzleMatchRepository implements MatchRepository {
  constructor(private readonly db: Database) {}

  async upsert(userId: string, match: JobMatchRecord): Promise<void> {
    const { result } = match;
    const values = {
      careerGoalId: match.careerGoalId,
      score: result.score,
      rubricVersion: result.rubricVersion,
      factors: {
        factors: result.factors,
        requirements: result.requirements,
        recommendations: result.recommendations,
      },
      calculatedAt: match.calculatedAt,
    };
    await withUserContext(this.db, userId, (tx) =>
      tx
        .insert(jobMatches)
        .values({ id: newId(), userId, jobId: match.jobId, ...values })
        .onConflictDoUpdate({ target: [jobMatches.userId, jobMatches.jobId], set: values }),
    );
  }
}
