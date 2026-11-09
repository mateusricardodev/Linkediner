import type { AuditLog } from '../../audit';
import { jobDedupeHash, type Job, type JobRepository } from '../../jobs';
import {
  computeCompatibility,
  learnPreferences,
  rankJob,
  type FeedbackRepository,
} from '../../matching';
import type { CareerGoal, FactRepository, ProfileRepository } from '../../profile';
import { AppError, newId } from '../../shared';
import { matchesGoal } from '../domain/discovery';
import type { CatalogPosting, CatalogReader } from './ports';

export interface DiscoveryItem {
  posting: CatalogPosting;
  /** Nulo enquanto a vaga não foi analisada, ou se ela não traz requisitos. */
  score: number | null;
  explanation: string[];
}

export type DiscoveryFeed =
  | { state: 'disabled' }
  | { state: 'needs_goal'; lastSyncedAt: Date | null }
  | {
      state: 'ready';
      goal: Pick<CareerGoal, 'id' | 'title'>;
      items: DiscoveryItem[];
      total: number;
      lastSyncedAt: Date | null;
    };

const FEED_LIMIT = 30;

export class DiscoveryService {
  constructor(
    private readonly catalog: CatalogReader,
    private readonly jobs: Pick<JobRepository, 'list' | 'insertFromCatalog' | 'findByHash'>,
    private readonly facts: Pick<FactRepository, 'list'>,
    private readonly profiles: Pick<ProfileRepository, 'listGoals'>,
    private readonly feedback: Pick<FeedbackRepository, 'list'>,
    private readonly audit: AuditLog,
  ) {}

  /**
   * Vagas para um objetivo, das mais recentes para as mais antigas. Tudo roda aqui, com dados que já
   * temos: a comparação com o perfil não chama a IA e não envia nada para fora.
   */
  async feed(userId: string, goalId?: string): Promise<DiscoveryFeed> {
    if (!(await this.catalog.isEnabled(userId))) return { state: 'disabled' };
    const [goals, lastSyncedAt] = await Promise.all([
      this.profiles.listGoals(userId),
      this.catalog.lastSyncedAt(userId),
    ]);
    const goal = goalId ? goals.find((g) => g.id === goalId) : goals.find((g) => g.isActive);
    if (goalId && !goal) throw new AppError('NOT_FOUND', 'Objetivo não encontrado.');
    if (!goal) return { state: 'needs_goal', lastSyncedAt };

    const [postings, saved, facts, feedback] = await Promise.all([
      this.catalog.open(userId),
      this.jobs.list(userId),
      this.facts.list(userId),
      this.feedback.list(userId),
    ]);
    const savedIds = new Set(saved.map((job) => job.externalJobId).filter(Boolean));
    const preferences = learnPreferences(feedback);

    const items: DiscoveryItem[] = [];
    for (const posting of postings) {
      if (savedIds.has(posting.id)) continue;
      if (!matchesGoal({ ...posting, remotePolicy: posting.fields.remotePolicy }, goal)) continue;
      const job = { ...posting.fields, company: posting.company };
      const score = posting.structured ? computeCompatibility({ job, facts, goal }).score : null;
      const rank = rankJob({ jobId: posting.id, score, job, preferences, ownReasons: [] });
      // Empresa que a pessoa bloqueou não volta por aqui.
      if (rank.hidden) continue;
      items.push({ posting, score, explanation: rank.explanation });
    }
    // O foco é o que acabou de sair. Sem data, vai para o fim.
    items.sort(
      (a, b) =>
        (b.posting.postedAt?.getTime() ?? 0) - (a.posting.postedAt?.getTime() ?? 0) ||
        a.posting.id.localeCompare(b.posting.id),
    );
    return {
      state: 'ready',
      goal: { id: goal.id, title: goal.title },
      items: items.slice(0, FEED_LIMIT),
      total: items.length,
      lastSyncedAt,
    };
  }

  /** Copia a vaga para as da pessoa. A partir daí, ela segue o caminho de qualquer vaga dela. */
  async save(userId: string, postingId: string): Promise<Job> {
    const posting = await this.catalog.find(userId, postingId);
    if (!posting) throw new AppError('NOT_FOUND', 'Esta vaga não está mais aberta.');
    if (!posting.structured) {
      throw new AppError(
        'CONFLICT',
        'Esta vaga ainda está em análise. Tente de novo em instantes.',
      );
    }
    // A identidade é a vaga na fonte, não o texto, que a empresa pode editar.
    const dedupeHash = jobDedupeHash(`catalogo:${posting.id}`);
    const inserted = await this.jobs.insertFromCatalog(userId, {
      id: newId(),
      dedupeHash,
      externalJobId: posting.id,
      source: posting.sourceKey,
      rawText: posting.rawText,
      applyUrl: posting.applyUrl,
      title: posting.title,
      company: posting.company,
      location: posting.location,
      ...posting.fields,
    });
    if (inserted) {
      await this.audit.record({
        actorType: 'user',
        actorId: userId,
        action: 'job.imported',
        entityType: 'job',
        entityId: inserted.id,
        metadata: { source: posting.sourceKey },
      });
      return inserted;
    }
    const existing = await this.jobs.findByHash(userId, dedupeHash);
    if (!existing) throw new AppError('INTERNAL', 'Não foi possível salvar a vaga.');
    return existing;
  }
}
