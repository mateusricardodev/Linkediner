import { and, asc, eq, schema, withUserContext, type Database } from '@linkediner/db';
import type { Job, JobFields, NewCatalogJob, NewJob } from '../domain/job';
import type { JobRepository } from '../application/ports/job-repository';

const { jobs } = schema;

const toJob = (r: typeof jobs.$inferSelect): Job => ({
  id: r.id,
  source: r.source,
  externalJobId: r.externalJobId,
  status: r.status,
  failureCode: r.failureCode,
  rawText: r.rawText,
  applyUrl: r.applyUrl,
  title: r.title,
  company: r.company,
  location: r.location,
  employmentType: r.employmentType,
  salaryText: r.salaryText,
  remotePolicy: r.remotePolicy,
  seniority: r.seniority,
  mustHave: r.mustHave,
  niceToHave: r.niceToHave,
  createdAt: r.createdAt,
});

export class DrizzleJobRepository implements JobRepository {
  constructor(private readonly db: Database) {}

  private owned(userId: string, id: string) {
    return and(eq(jobs.id, id), eq(jobs.userId, userId));
  }

  insertFromCatalog(userId: string, job: NewCatalogJob) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .insert(jobs)
        .values({ ...job, userId, status: 'ready' })
        .onConflictDoNothing({ target: [jobs.userId, jobs.dedupeHash] })
        .returning();
      return row ? toJob(row) : null;
    });
  }

  insert(userId: string, job: NewJob) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .insert(jobs)
        .values({ ...job, userId })
        .onConflictDoNothing({ target: [jobs.userId, jobs.dedupeHash] })
        .returning();
      return row ? toJob(row) : null;
    });
  }

  findByHash(userId: string, dedupeHash: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.userId, userId), eq(jobs.dedupeHash, dedupeHash)));
      return row ? toJob(row) : null;
    });
  }

  find(userId: string, id: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx.select().from(jobs).where(this.owned(userId, id));
      return row ? toJob(row) : null;
    });
  }

  list(userId: string) {
    return withUserContext(this.db, userId, async (tx) =>
      (
        await tx
          .select()
          .from(jobs)
          .where(eq(jobs.userId, userId))
          .orderBy(asc(jobs.createdAt), asc(jobs.id))
      ).map(toJob),
    );
  }

  async saveFields(userId: string, id: string, fields: JobFields) {
    await withUserContext(this.db, userId, (tx) =>
      tx
        .update(jobs)
        .set({ ...fields, status: 'ready', failureCode: null })
        .where(this.owned(userId, id)),
    );
  }

  async markStructuring(userId: string, id: string) {
    await withUserContext(this.db, userId, (tx) =>
      tx
        .update(jobs)
        .set({ status: 'structuring', failureCode: null })
        .where(this.owned(userId, id)),
    );
  }

  async markFailed(userId: string, id: string, failureCode: string) {
    await withUserContext(this.db, userId, (tx) =>
      tx.update(jobs).set({ status: 'failed', failureCode }).where(this.owned(userId, id)),
    );
  }

  delete(userId: string, id: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const rows = await tx.delete(jobs).where(this.owned(userId, id)).returning({ id: jobs.id });
      return rows.length > 0;
    });
  }
}
