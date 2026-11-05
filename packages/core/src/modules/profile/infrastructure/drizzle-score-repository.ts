import { desc, eq, schema, withUserContext, type Database } from '@linkediner/db';
import { newId } from '../../shared';
import type { ScoreFactor, ScoreResult } from '../domain/score';
import type { ScoreRepository, StoredScore } from '../application/ports/score-repository';

const { profileScores } = schema;

const toStored = (r: typeof profileScores.$inferSelect): StoredScore => ({
  score: r.score,
  rubricVersion: r.rubricVersion,
  factors: r.factors as ScoreFactor[],
  createdAt: r.createdAt,
});

export class DrizzleScoreRepository implements ScoreRepository {
  constructor(private readonly db: Database) {}

  history(userId: string, limit: number) {
    return withUserContext(this.db, userId, async (tx) =>
      (
        await tx
          .select()
          .from(profileScores)
          .where(eq(profileScores.userId, userId))
          .orderBy(desc(profileScores.createdAt), desc(profileScores.id))
          .limit(limit)
      ).map(toStored),
    );
  }

  append(userId: string, profileId: string, score: ScoreResult) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .insert(profileScores)
        .values({ id: newId(), userId, profileId, ...score })
        .returning();
      return toStored(row!);
    });
  }
}
