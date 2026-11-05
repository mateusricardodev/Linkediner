import { createHash } from 'node:crypto';
import type { AiGenerationLog, AiProvider, VersionedPrompt } from '../../ai';
import type { AuditLog } from '../../audit';
import { redactSensitiveData } from '../../extraction';
import type { ConsentService } from '../../privacy';
import { groundJob, JOB_FAILURES, JobOutput, type StructureJobPayload } from '../domain/job';
import type { JobRepository } from './ports/job-repository';

export interface StructureJobDeps {
  jobs: Pick<JobRepository, 'find' | 'saveFields' | 'markFailed'>;
  consents: Pick<ConsentService, 'status'>;
  ai: AiProvider;
  prompt: VersionedPrompt;
  generations: Pick<AiGenerationLog, 'record'>;
  audit: AuditLog;
}

export type StructureOutcome = 'ready' | 'failed' | 'skipped';

/** Organiza o texto da vaga em campos e confere cada valor contra o texto. Roda no worker. */
export class StructureJob {
  constructor(private readonly deps: StructureJobDeps) {}

  async run(
    payload: StructureJobPayload,
    opts: { isLastAttempt: boolean },
  ): Promise<StructureOutcome> {
    const { userId, jobId } = payload;
    const job = await this.deps.jobs.find(userId, jobId);
    if (!job || job.status !== 'structuring') return 'skipped';

    const { granted } = await this.deps.consents.status(userId);
    if (!granted.ai_processing) return this.fail(payload, JOB_FAILURES.consentRevoked);

    // A vaga pode trazer e-mail ou telefone de recrutadores: não precisam ir para o provedor.
    const jobText = redactSensitiveData(job.rawText);
    try {
      const { data, usage } = await this.deps.ai.generateStructured({
        task: 'structure_job',
        prompt: this.deps.prompt,
        promptInput: { jobText },
        schema: JobOutput,
      });
      const { fields, report } = groundJob(data, jobText);
      await this.deps.jobs.saveFields(userId, jobId, fields);
      await this.deps.generations.record({
        userId,
        task: 'structure_job',
        usage,
        inputHash: createHash('sha256').update(jobText).digest('hex'),
        output: data,
        validation: { ...report },
      });
      await this.deps.audit.record({
        actorType: 'system',
        actorId: userId,
        action: 'job.structured',
        entityType: 'job',
        entityId: jobId,
        metadata: { ...report, promptVersion: usage.promptVersion },
      });
      return 'ready';
    } catch (error) {
      if (opts.isLastAttempt) await this.fail(payload, JOB_FAILURES.processingError);
      throw error;
    }
  }

  private async fail(payload: StructureJobPayload, code: string): Promise<StructureOutcome> {
    await this.deps.jobs.markFailed(payload.userId, payload.jobId, code);
    await this.deps.audit.record({
      actorType: 'system',
      actorId: payload.userId,
      action: 'job.failed',
      entityType: 'job',
      entityId: payload.jobId,
      metadata: { failureCode: code },
    });
    return 'failed';
  }
}
