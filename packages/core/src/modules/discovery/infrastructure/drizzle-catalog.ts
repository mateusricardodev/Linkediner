import { and, desc, eq, schema, sql, withUserContext, type Database } from '@linkediner/db';
import { GRANTING_STATUSES } from '../../billing';
import { newId, type FeatureKey } from '../../shared';
import type { Board, CatalogPosting, CatalogReader, CatalogRepository } from '../application/ports';
import { buildRawText, contentHash, type ExternalPosting } from '../domain/discovery';

const { careerGoals, externalJobs, jobBoards, jobSources } = schema;

const MONITORING_FEATURE: FeatureKey = 'monitoring.frequency_hours';

const postingColumns = {
  id: externalJobs.id,
  title: externalJobs.title,
  company: externalJobs.company,
  location: externalJobs.location,
  remoteHint: externalJobs.remoteHint,
  applyUrl: externalJobs.applyUrl,
  postedAt: externalJobs.postedAt,
  rawText: externalJobs.rawText,
  structureStatus: externalJobs.structureStatus,
  employmentType: externalJobs.employmentType,
  salaryText: externalJobs.salaryText,
  remotePolicy: externalJobs.remotePolicy,
  seniority: externalJobs.seniority,
  mustHave: externalJobs.mustHave,
  niceToHave: externalJobs.niceToHave,
  sourceKey: jobBoards.sourceKey,
};

type PostingRow = {
  id: string;
  title: string;
  company: string;
  location: string;
  remoteHint: boolean;
  applyUrl: string;
  postedAt: Date | null;
  rawText: string;
  structureStatus: 'pending' | 'ready' | 'failed';
  employmentType: string | null;
  salaryText: string | null;
  remotePolicy: CatalogPosting['fields']['remotePolicy'];
  seniority: CatalogPosting['fields']['seniority'];
  mustHave: string[];
  niceToHave: string[];
  sourceKey: string;
};

const toPosting = (r: PostingRow): CatalogPosting => ({
  id: r.id,
  title: r.title,
  company: r.company,
  location: r.location,
  remoteHint: r.remoteHint,
  applyUrl: r.applyUrl,
  postedAt: r.postedAt,
  rawText: r.rawText,
  sourceKey: r.sourceKey,
  structured: r.structureStatus === 'ready',
  fields: {
    employmentType: r.employmentType,
    salaryText: r.salaryText,
    remotePolicy: r.remotePolicy,
    seniority: r.seniority,
    mustHave: r.mustHave,
    niceToHave: r.niceToHave,
  },
});

/** O worker usa o papel dono do banco. O catálogo não guarda dado de ninguém. */
export class DrizzleCatalogRepository implements CatalogRepository {
  constructor(private readonly db: Database) {}

  activeBoards(): Promise<Board[]> {
    return this.db
      .select({
        id: jobBoards.id,
        sourceKey: jobBoards.sourceKey,
        token: jobBoards.token,
        company: jobBoards.company,
      })
      .from(jobBoards)
      .innerJoin(jobSources, eq(jobSources.key, jobBoards.sourceKey))
      .where(and(eq(jobBoards.enabled, true), eq(jobSources.status, 'active')));
  }

  replacePostings(board: Board, postings: ExternalPosting[], now: Date) {
    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ externalId: externalJobs.externalId, contentHash: externalJobs.contentHash })
        .from(externalJobs)
        .where(eq(externalJobs.boardId, board.id));
      const known = new Map(existing.map((row) => [row.externalId, row.contentHash]));
      const seen = new Set(postings.map((posting) => posting.externalId));
      let inserted = 0;
      let updated = 0;

      for (const posting of postings) {
        const company = posting.company ?? board.company;
        const rawText = buildRawText(posting, company);
        const hash = contentHash(rawText);
        const previous = known.get(posting.externalId);
        if (previous === undefined) inserted++;
        else if (previous !== hash) updated++;
        const source = {
          title: posting.title,
          company,
          location: posting.location,
          remoteHint: posting.remoteHint,
          applyUrl: posting.applyUrl,
          postedAt: posting.postedAt,
          rawText,
          contentHash: hash,
          lastSeenAt: now,
        };
        await tx
          .insert(externalJobs)
          .values({
            id: newId(),
            boardId: board.id,
            externalId: posting.externalId,
            ...source,
            firstSeenAt: now,
          })
          .onConflictDoUpdate({
            target: [externalJobs.boardId, externalJobs.externalId],
            set: {
              ...source,
              // Texto novo pede análise nova. Sem mudança, a análise continua valendo.
              ...(previous !== undefined && previous !== hash
                ? { structureStatus: 'pending' as const }
                : {}),
            },
          });
      }

      let removed = 0;
      for (const { externalId } of existing) {
        if (seen.has(externalId)) continue;
        await tx
          .delete(externalJobs)
          .where(and(eq(externalJobs.boardId, board.id), eq(externalJobs.externalId, externalId)));
        removed++;
      }
      return { inserted, updated, removed };
    });
  }

  async markBoard(boardId: string, result: { syncedAt: Date } | { error: string }) {
    await this.db
      .update(jobBoards)
      .set(
        'error' in result
          ? { lastError: result.error }
          : { lastSyncedAt: result.syncedAt, lastError: null },
      )
      .where(eq(jobBoards.id, boardId));
  }

  async pendingPostings(limit: number) {
    const rows = await this.db
      .select(postingColumns)
      .from(externalJobs)
      .innerJoin(jobBoards, eq(jobBoards.id, externalJobs.boardId))
      .where(eq(externalJobs.structureStatus, 'pending'))
      .orderBy(sql`${externalJobs.postedAt} DESC NULLS LAST`)
      .limit(limit);
    return rows.map(toPosting);
  }

  /**
   * Só objetivos de quem tem as vagas encontradas no plano: quem não vê a lista não gasta análise.
   * O plano vale como em `planOf`: o da assinatura válida ou, sem ela, o gratuito.
   */
  activeGoals() {
    const granting = sql.join(
      GRANTING_STATUSES.map((status) => sql`${status}`),
      sql`, `,
    );
    return this.db
      .select({
        title: careerGoals.title,
        targetRoles: careerGoals.targetRoles,
        locations: careerGoals.locations,
        remoteOnly: careerGoals.remoteOnly,
      })
      .from(careerGoals)
      .where(
        and(
          eq(careerGoals.isActive, true),
          sql`exists (
            select 1
            from plans p
            join plan_entitlements e on e.plan_id = p.id
            left join subscriptions s
              on s.user_id = ${careerGoals.userId} and s.status in (${granting})
            where e.feature_key = ${MONITORING_FEATURE}
              and e.limit_value > 0
              and (p.id = s.plan_id or (s.id is null and p.key = 'free' and p.active))
          )`,
        ),
      );
  }

  async saveStructured(
    id: string,
    fields: CatalogPosting['fields'],
    usage: { model: string; promptVersion: number },
  ) {
    await this.db
      .update(externalJobs)
      .set({ ...fields, ...usage, structureStatus: 'ready' })
      .where(eq(externalJobs.id, id));
  }

  async markStructureFailed(id: string) {
    await this.db
      .update(externalJobs)
      .set({ structureStatus: 'failed' })
      .where(eq(externalJobs.id, id));
  }
}

/** Leitura com o papel da aplicação, que só tem permissão de consulta nestas tabelas. */
export class DrizzleCatalogReader implements CatalogReader {
  constructor(private readonly db: Database) {}

  isEnabled(userId: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const rows = await tx
        .select({ key: jobSources.key })
        .from(jobSources)
        .where(eq(jobSources.status, 'active'))
        .limit(1);
      return rows.length > 0;
    });
  }

  /** Só de fontes ligadas: desligar uma fonte tira as vagas dela da tela na hora. */
  open(userId: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const rows = await tx
        .select(postingColumns)
        .from(externalJobs)
        .innerJoin(jobBoards, eq(jobBoards.id, externalJobs.boardId))
        .innerJoin(jobSources, eq(jobSources.key, jobBoards.sourceKey))
        .where(eq(jobSources.status, 'active'))
        .orderBy(desc(externalJobs.postedAt));
      return rows.map(toPosting);
    });
  }

  find(userId: string, id: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .select(postingColumns)
        .from(externalJobs)
        .innerJoin(jobBoards, eq(jobBoards.id, externalJobs.boardId))
        .innerJoin(jobSources, eq(jobSources.key, jobBoards.sourceKey))
        .where(and(eq(externalJobs.id, id), eq(jobSources.status, 'active')));
      return row ? toPosting(row) : null;
    });
  }

  lastSyncedAt(userId: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .select({ at: sql<Date | null>`max(${jobBoards.lastSyncedAt})` })
        .from(jobBoards);
      return row?.at ? new Date(row.at) : null;
    });
  }
}
