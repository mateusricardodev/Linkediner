import { and, asc, desc, eq, schema, sql, withUserContext, type Database } from '@linkediner/db';
import type { ResumeContent } from '../../resumes';
import { newId } from '../../shared';
import type { ApplicationRepository } from '../application/application-service';
import type { Application, JobSummary } from '../domain/application';

const { applications, applicationEvents, manualTasks } = schema;

const toApplication = (r: typeof applications.$inferSelect): Application => ({
  id: r.id,
  jobId: r.jobId,
  job: r.jobSnapshot as JobSummary,
  state: r.state,
  resumeId: r.resumeId,
  submissionMode: r.submissionMode,
  submittedAt: r.submittedAt,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export class DrizzleApplicationRepository implements ApplicationRepository {
  constructor(private readonly db: Database) {}

  private owned(userId: string, id: string) {
    return and(eq(applications.id, id), eq(applications.userId, userId));
  }

  create(userId: string, application: Parameters<ApplicationRepository['create']>[1]) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .insert(applications)
        .values({
          id: application.id,
          userId,
          jobId: application.jobId,
          jobSnapshot: application.job,
          state: application.state,
        })
        .onConflictDoNothing({ target: [applications.userId, applications.jobId] })
        .returning();
      if (!row) return null;
      await tx.insert(applicationEvents).values({
        id: newId(),
        applicationId: row.id,
        userId,
        fromState: null,
        toState: application.state,
        actor: 'user',
      });
      return toApplication(row);
    });
  }

  findByJob(userId: string, jobId: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .select()
        .from(applications)
        .where(and(eq(applications.userId, userId), eq(applications.jobId, jobId)));
      return row ? toApplication(row) : null;
    });
  }

  find(userId: string, id: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx.select().from(applications).where(this.owned(userId, id));
      return row ? toApplication(row) : null;
    });
  }

  list(userId: string) {
    return withUserContext(this.db, userId, async (tx) =>
      (
        await tx
          .select()
          .from(applications)
          .where(eq(applications.userId, userId))
          .orderBy(desc(applications.updatedAt), desc(applications.id))
      ).map(toApplication),
    );
  }

  events(userId: string, id: string) {
    return withUserContext(this.db, userId, async (tx) =>
      (
        await tx
          .select()
          .from(applicationEvents)
          .where(and(eq(applicationEvents.applicationId, id), eq(applicationEvents.userId, userId)))
          .orderBy(asc(applicationEvents.createdAt), asc(applicationEvents.id))
      ).map((r) => ({
        from: r.fromState,
        to: r.toState,
        actor: r.actor,
        reason: r.reason,
        createdAt: r.createdAt,
      })),
    );
  }

  manualTasks(userId: string, id: string) {
    return withUserContext(this.db, userId, (tx) =>
      tx
        .select({
          id: manualTasks.id,
          reason: manualTasks.reason,
          resolvedAt: manualTasks.resolvedAt,
        })
        .from(manualTasks)
        .where(and(eq(manualTasks.applicationId, id), eq(manualTasks.userId, userId)))
        .orderBy(asc(manualTasks.createdAt)),
    );
  }

  material(userId: string, id: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .select({ material: applications.materialSnapshot })
        .from(applications)
        .where(this.owned(userId, id));
      return (row?.material as ResumeContent | null | undefined) ?? null;
    });
  }

  transition(
    userId: string,
    id: string,
    from: Application['state'],
    steps: Parameters<ApplicationRepository['transition']>[3],
    change: Parameters<ApplicationRepository['transition']>[4] = {},
  ) {
    return withUserContext(this.db, userId, async (tx) => {
      const { createManualTask, resolveManualTasks, ...fields } = change;
      const [row] = await tx
        .update(applications)
        .set({ state: steps.at(-1)?.to ?? from, updatedAt: new Date(), ...fields })
        .where(and(this.owned(userId, id), eq(applications.state, from)))
        .returning();
      if (!row) return null;

      let previous = from;
      for (const step of steps) {
        await tx.insert(applicationEvents).values({
          id: newId(),
          applicationId: id,
          userId,
          fromState: previous,
          toState: step.to,
          actor: step.actor,
          reason: step.reason ?? null,
        });
        previous = step.to;
      }
      if (createManualTask) {
        await tx.insert(manualTasks).values({
          id: newId(),
          applicationId: id,
          userId,
          reason: createManualTask.reason,
        });
      }
      if (resolveManualTasks) {
        await tx
          .update(manualTasks)
          .set({ resolvedAt: resolveManualTasks.at })
          .where(
            and(
              eq(manualTasks.applicationId, id),
              eq(manualTasks.userId, userId),
              sql`${manualTasks.resolvedAt} IS NULL`,
            ),
          );
      }
      return toApplication(row);
    });
  }
}
