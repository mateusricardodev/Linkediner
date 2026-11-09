import { and, asc, eq, schema, sql, withUserContext, type Database } from '@linkediner/db';
import { newId } from '../../shared';
import {
  LINKEDIN_CHECKLIST_ITEMS,
  type CareerGoal,
  type CareerGoalInput,
  type LinkedinChecklistItem,
  type Profile,
  type ProfileLink,
} from '../domain/profile';
import type { ProfileRepository } from '../application/ports/profile-repository';

const { profiles, profileLinks, careerGoals } = schema;

const toProfile = (r: typeof profiles.$inferSelect): Profile => ({
  id: r.id,
  headline: r.headline,
  summary: r.summary,
  yearsExperience: r.yearsExperience,
  linkedinChecklist: r.linkedinChecklist.filter((item): item is LinkedinChecklistItem =>
    (LINKEDIN_CHECKLIST_ITEMS as readonly string[]).includes(item),
  ),
});

const toGoal = (r: typeof careerGoals.$inferSelect): CareerGoal => ({
  id: r.id,
  title: r.title,
  seniority: r.seniority,
  targetRoles: r.targetRoles,
  locations: r.locations,
  remoteOnly: r.remoteOnly,
  salaryMin: r.salaryMin,
  currency: r.currency,
  salaryPeriod: r.salaryPeriod,
  isActive: r.isActive,
  createdAt: r.createdAt,
});

/** Cada método roda com withUserContext: o RLS impede acesso a dados de outro usuário. */
export class DrizzleProfileRepository implements ProfileRepository {
  constructor(private readonly db: Database) {}

  private run<T>(userId: string, fn: Parameters<typeof withUserContext<T>>[2]) {
    return withUserContext(this.db, userId, fn);
  }

  getOrCreateProfile(userId: string): Promise<Profile> {
    return this.run(userId, async (tx) => {
      await tx
        .insert(profiles)
        .values({ id: newId(), userId })
        .onConflictDoNothing({ target: profiles.userId });
      const [row] = await tx.select().from(profiles).where(eq(profiles.userId, userId));
      return toProfile(row!);
    });
  }

  updateProfile(userId: string, patch: Partial<Omit<Profile, 'id'>>): Promise<Profile> {
    return this.run(userId, async (tx) => {
      const [row] = await tx
        .update(profiles)
        .set(patch)
        .where(eq(profiles.userId, userId))
        .returning();
      return toProfile(row!);
    });
  }

  listLinks(userId: string): Promise<ProfileLink[]> {
    return this.run(userId, (tx) =>
      tx
        .select({ kind: profileLinks.kind, url: profileLinks.url })
        .from(profileLinks)
        .where(eq(profileLinks.userId, userId))
        .orderBy(asc(profileLinks.position)),
    );
  }

  replaceLinks(userId: string, profileId: string, links: ProfileLink[]): Promise<ProfileLink[]> {
    return this.run(userId, async (tx) => {
      await tx.delete(profileLinks).where(eq(profileLinks.userId, userId));
      if (links.length) {
        await tx
          .insert(profileLinks)
          .values(links.map((l, position) => ({ id: newId(), userId, profileId, position, ...l })));
      }
      return links;
    });
  }

  listGoals(userId: string): Promise<CareerGoal[]> {
    return this.run(userId, async (tx) =>
      (
        await tx
          .select()
          .from(careerGoals)
          .where(eq(careerGoals.userId, userId))
          .orderBy(asc(careerGoals.createdAt))
      ).map(toGoal),
    );
  }

  findGoal(userId: string, goalId: string): Promise<CareerGoal | null> {
    return this.run(userId, async (tx) => {
      const [row] = await tx
        .select()
        .from(careerGoals)
        .where(and(eq(careerGoals.id, goalId), eq(careerGoals.userId, userId)));
      return row ? toGoal(row) : null;
    });
  }

  countActiveGoals(userId: string, excludeGoalId?: string): Promise<number> {
    return this.run(userId, async (tx) => {
      const conditions = [eq(careerGoals.userId, userId), eq(careerGoals.isActive, true)];
      if (excludeGoalId) conditions.push(sql`${careerGoals.id} <> ${excludeGoalId}`);
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(careerGoals)
        .where(and(...conditions));
      return row?.n ?? 0;
    });
  }

  insertGoal(userId: string, goal: CareerGoalInput): Promise<CareerGoal> {
    return this.run(userId, async (tx) => {
      const [row] = await tx
        .insert(careerGoals)
        .values({ id: newId(), userId, ...goal })
        .returning();
      return toGoal(row!);
    });
  }

  updateGoal(userId: string, goalId: string, goal: CareerGoalInput): Promise<CareerGoal | null> {
    return this.run(userId, async (tx) => {
      const [row] = await tx
        .update(careerGoals)
        .set(goal)
        .where(and(eq(careerGoals.id, goalId), eq(careerGoals.userId, userId)))
        .returning();
      return row ? toGoal(row) : null;
    });
  }

  deleteGoal(userId: string, goalId: string): Promise<boolean> {
    return this.run(userId, async (tx) => {
      const rows = await tx
        .delete(careerGoals)
        .where(and(eq(careerGoals.id, goalId), eq(careerGoals.userId, userId)))
        .returning({ id: careerGoals.id });
      return rows.length > 0;
    });
  }
}
