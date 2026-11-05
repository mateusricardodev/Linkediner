import type { AuditLog } from '../../audit';
import type { ConsentService } from '../../privacy';
import { AppError, newId } from '../../shared';
import { JOB_FAILURES, jobDedupeHash, validateJobImport, type Job } from '../domain/job';
import type { JobQueue, JobRepository } from './ports/job-repository';

const notFound = () => new AppError('NOT_FOUND', 'Vaga não encontrada.');

/** Importação manual de vagas: o usuário cola o texto. O sistema nunca acessa o link (ADR 0015). */
export class JobService {
  constructor(
    private readonly repo: JobRepository,
    private readonly consents: Pick<ConsentService, 'status'>,
    private readonly queue: JobQueue,
    private readonly audit: AuditLog,
  ) {}

  async import(
    userId: string,
    input: { text: string; applyUrl?: string | undefined },
  ): Promise<Job> {
    const { text, applyUrl } = validateJobImport(input);

    const { granted } = await this.consents.status(userId);
    if (!granted.ai_processing) {
      throw new AppError(
        'CONSENT_REQUIRED',
        'Autorize o processamento por IA para analisar a vaga.',
        {
          missing: ['ai_processing'],
        },
      );
    }

    const dedupeHash = jobDedupeHash(text);
    const inserted = await this.repo.insert(userId, {
      id: newId(),
      rawText: text,
      applyUrl,
      dedupeHash,
    });
    if (inserted) {
      await this.enqueue(userId, inserted.id);
      await this.audit.record({
        actorType: 'user',
        actorId: userId,
        action: 'job.imported',
        entityType: 'job',
        entityId: inserted.id,
        metadata: { source: 'manual' },
      });
      return inserted;
    }

    // Mesmo texto: não cria outra vaga. Só tenta de novo se a análise anterior falhou.
    const existing = await this.repo.findByHash(userId, dedupeHash);
    if (!existing) throw new AppError('INTERNAL', 'Não foi possível importar a vaga.');
    if (existing.status !== 'failed') return existing;
    await this.repo.markStructuring(userId, existing.id);
    await this.enqueue(userId, existing.id);
    return { ...existing, status: 'structuring', failureCode: null };
  }

  list(userId: string): Promise<Job[]> {
    return this.repo.list(userId);
  }

  async get(userId: string, id: string): Promise<Job> {
    const job = await this.repo.find(userId, id);
    if (!job) throw notFound();
    return job;
  }

  async delete(userId: string, id: string): Promise<void> {
    if (!(await this.repo.delete(userId, id))) throw notFound();
    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: 'job.deleted',
      entityType: 'job',
      entityId: id,
    });
  }

  private async enqueue(userId: string, jobId: string) {
    try {
      await this.queue.enqueue({ userId, jobId });
    } catch {
      await this.repo.markFailed(userId, jobId, JOB_FAILURES.processingError);
      throw new AppError(
        'DEPENDENCY_UNAVAILABLE',
        'Não foi possível analisar a vaga. Tente de novo.',
      );
    }
  }
}
