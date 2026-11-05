import type { JobRepository } from '../../jobs';
import type { FactRepository, ProfileRepository } from '../../profile';
import { AppError } from '../../shared';
import { computeCompatibility, type MatchResult } from '../domain/compatibility';

export interface JobMatchRecord {
  jobId: string;
  careerGoalId: string | null;
  result: MatchResult;
  calculatedAt: Date;
}

export interface MatchRepository {
  /** Guarda o último cálculo da vaga para o usuário. */
  upsert(userId: string, match: JobMatchRecord): Promise<void>;
}

/** Calcula a compatibilidade a partir dos dados atuais. Sem chamar a IA. */
export class MatchingService {
  constructor(
    private readonly jobs: Pick<JobRepository, 'find'>,
    private readonly facts: Pick<FactRepository, 'list'>,
    private readonly profiles: Pick<ProfileRepository, 'listGoals'>,
    private readonly matches: MatchRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Sem objetivo informado, usa o primeiro objetivo ativo. */
  async forJob(userId: string, jobId: string, goalId?: string): Promise<JobMatchRecord> {
    const job = await this.jobs.find(userId, jobId);
    if (!job) throw new AppError('NOT_FOUND', 'Vaga não encontrada.');
    if (job.status !== 'ready') {
      throw new AppError('CONFLICT', 'A vaga ainda não foi analisada.');
    }

    const [facts, goals] = await Promise.all([
      this.facts.list(userId),
      this.profiles.listGoals(userId),
    ]);
    const goal = goalId ? goals.find((g) => g.id === goalId) : goals.find((g) => g.isActive);
    if (goalId && !goal) throw new AppError('NOT_FOUND', 'Objetivo não encontrado.');

    const record: JobMatchRecord = {
      jobId,
      careerGoalId: goal?.id ?? null,
      result: computeCompatibility({ job, facts, goal }),
      calculatedAt: this.now(),
    };
    await this.matches.upsert(userId, record);
    return record;
  }
}
