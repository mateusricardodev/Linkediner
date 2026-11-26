import { and, eq, schema, withUserContext, type Database } from '@linkediner/db';
import type { FieldCipher } from '../../crypto';
import { newId } from '../../shared';
import type { DailyPicksRepository, DailySnapshot } from '../application/daily-selection';

const { dailyJobPicks } = schema;

const ITEMS = 'daily_job_picks.items';

export class DrizzleDailyPicksRepository implements DailyPicksRepository {
  constructor(
    private readonly db: Database,
    private readonly cipher: FieldCipher,
  ) {}

  async find(userId: string, day: string): Promise<DailySnapshot | null> {
    const c = await this.cipher.forUser(userId);
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .select()
        .from(dailyJobPicks)
        .where(and(eq(dailyJobPicks.userId, userId), eq(dailyJobPicks.day, day)));
      return row ? (c.openJson<DailySnapshot>(ITEMS, row.items) ?? null) : null;
    });
  }

  async save(userId: string, day: string, goalId: string, snapshot: DailySnapshot): Promise<void> {
    const c = await this.cipher.forUser(userId);
    await withUserContext(this.db, userId, (tx) =>
      tx
        .insert(dailyJobPicks)
        .values({ id: newId(), userId, day, goalId, items: c.sealJson(ITEMS, snapshot) })
        // Uma segunda visita simultânea não duplica nem sobrescreve: o primeiro snapshot do dia fica.
        .onConflictDoNothing({ target: [dailyJobPicks.userId, dailyJobPicks.day] }),
    );
  }
}
