import type { AuditLog } from '../../audit';
import type { Job, JobRepository } from '../../jobs';
import type { FactRepository, ProfileRepository } from '../../profile';
import { AppError } from '../../shared';
import { computeCompatibility } from '../domain/compatibility';
import {
  learnPreferences,
  rankJob,
  snapshotOf,
  validateFeedback,
  type FeedbackReason,
  type FeedbackRecord,
} from '../domain/preferences';

/** Toda operação usa o contexto do usuário dono (RLS). */
export interface FeedbackRepository {
  list(userId: string): Promise<FeedbackRecord[]>;
  /** Substitui, numa transação, as avaliações da vaga. */
  replace(userId: string, jobId: string, records: FeedbackRecord[]): Promise<void>;
}

export interface Recommendation {
  job: Job;
  score: number | null;
  rankScore: number | null;
  explanation: string[];
  feedback: FeedbackReason[];
}

/** Avaliações do usuário e recomendações personalizadas. Sem IA e sem treinar modelo nenhum. */
export class FeedbackService {
  constructor(
    private readonly feedback: FeedbackRepository,
    private readonly jobs: Pick<JobRepository, 'find' | 'list'>,
    private readonly facts: Pick<FactRepository, 'list'>,
    private readonly profiles: Pick<ProfileRepository, 'listGoals'>,
    private readonly applications: {
      list(userId: string): Promise<{ jobId: string | null; submittedAt: Date | null }[]>;
    },
    private readonly audit: AuditLog,
  ) {}

  async forJob(userId: string, jobId: string): Promise<FeedbackReason[]> {
    await this.readyJob(userId, jobId);
    const all = await this.feedback.list(userId);
    return all.filter((f) => f.jobId === jobId).map((f) => f.reason);
  }

  /** A lista enviada substitui a anterior. Lista vazia limpa a avaliação. */
  async set(userId: string, jobId: string, reasons: FeedbackReason[]): Promise<FeedbackReason[]> {
    const job = await this.readyJob(userId, jobId);
    const unique = [...new Set(reasons)];
    validateFeedback(unique, job);
    const snapshot = snapshotOf(job);
    await this.feedback.replace(
      userId,
      jobId,
      unique.map((reason) => ({ jobId, reason, snapshot })),
    );
    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: 'job.feedback',
      entityType: 'job',
      entityId: jobId,
      metadata: { reasons: unique },
    });
    return unique;
  }

  /**
   * Vagas prontas, das mais às menos indicadas. Avaliações mudam a ordem, nunca o score.
   * Vaga com candidatura já enviada sai da lista, sem a pessoa precisar avaliar.
   */
  async recommendations(
    userId: string,
    goalId?: string,
  ): Promise<{ items: Recommendation[]; hidden: number }> {
    const [jobs, facts, goals, feedback, applications] = await Promise.all([
      this.jobs.list(userId),
      this.facts.list(userId),
      this.profiles.listGoals(userId),
      this.feedback.list(userId),
      this.applications.list(userId),
    ]);
    const sent = new Set(applications.filter((a) => a.submittedAt).map((a) => a.jobId));
    const goal = goalId ? goals.find((g) => g.id === goalId) : goals.find((g) => g.isActive);
    if (goalId && !goal) throw new AppError('NOT_FOUND', 'Objetivo não encontrado.');

    const preferences = learnPreferences(feedback);
    const items: Recommendation[] = [];
    let hidden = 0;
    for (const job of jobs.filter((j) => j.status === 'ready')) {
      if (sent.has(job.id)) {
        hidden++;
        continue;
      }
      const { score } = computeCompatibility({ job, facts, goal });
      const ownReasons = feedback.filter((f) => f.jobId === job.id).map((f) => f.reason);
      const rank = rankJob({ jobId: job.id, score, job, preferences, ownReasons });
      if (rank.hidden) {
        hidden++;
        continue;
      }
      items.push({
        job,
        score,
        rankScore: rank.rankScore,
        explanation: rank.explanation,
        feedback: ownReasons,
      });
    }
    // Vagas sem score vão para o fim. Empates: a mais recente primeiro.
    items.sort(
      (a, b) =>
        (b.rankScore ?? -1) - (a.rankScore ?? -1) ||
        b.job.createdAt.getTime() - a.job.createdAt.getTime() ||
        b.job.id.localeCompare(a.job.id),
    );
    return { items, hidden };
  }

  private async readyJob(userId: string, jobId: string): Promise<Job> {
    const job = await this.jobs.find(userId, jobId);
    if (!job) throw new AppError('NOT_FOUND', 'Vaga não encontrada.');
    if (job.status !== 'ready') throw new AppError('CONFLICT', 'A vaga ainda não foi analisada.');
    return job;
  }
}
