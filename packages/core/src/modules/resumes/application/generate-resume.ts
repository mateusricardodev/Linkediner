import { createHash } from 'node:crypto';
import type { AiGenerationLog, AiProvider, VersionedPrompt } from '../../ai';
import type { AuditLog } from '../../audit';
import type { JobRepository } from '../../jobs';
import type { ConsentService } from '../../privacy';
import type { FactRepository } from '../../profile';
import type { QuotaGate } from '../../shared';
import {
  buildResume,
  collectCorrections,
  RESUME_FAILURES,
  ResumeOutput,
  resumeUsageKey,
  type GenerateResumeJob,
} from '../domain/resume';
import type { ResumeRepository } from './ports/resume-repository';

export interface GenerateResumeDeps {
  resumes: Pick<ResumeRepository, 'find' | 'list' | 'saveDraft' | 'markFailed'>;
  facts: Pick<FactRepository, 'list'>;
  jobs: Pick<JobRepository, 'find'>;
  consents: Pick<ConsentService, 'status'>;
  ai: AiProvider;
  prompt: VersionedPrompt;
  generations: Pick<AiGenerationLog, 'record'>;
  quota: Pick<QuotaGate, 'refund'>;
  audit: AuditLog;
}

export type GenerateOutcome = 'draft' | 'failed' | 'skipped';

/** Gera a redação com IA e confere cada frase contra os fatos. Roda no worker. */
export class GenerateResume {
  constructor(private readonly deps: GenerateResumeDeps) {}

  async run(job: GenerateResumeJob, opts: { isLastAttempt: boolean }): Promise<GenerateOutcome> {
    const { userId, resumeId } = job;
    const resume = await this.deps.resumes.find(userId, resumeId);
    if (!resume) {
      await this.deps.quota.refund(userId, 'resume.improved', resumeUsageKey(resumeId));
      return 'skipped';
    }
    if (resume.status !== 'generating') return 'skipped';

    const { granted } = await this.deps.consents.status(userId);
    if (!granted.ai_processing) return this.fail(job, RESUME_FAILURES.consentRevoked);

    const facts = (await this.deps.facts.list(userId)).filter(
      (f) => f.verification === 'extracted' || f.verification === 'user_confirmed',
    );
    if (facts.length === 0) return this.fail(job, RESUME_FAILURES.noFacts);

    // Só o necessário: sem os trechos do documento original.
    const factsForAi = facts.map(({ id, type, data }) => ({ id, type, data }));
    // O que a pessoa corrigiu antes ensina o estilo, mas nunca comprova nada (ADR 0025).
    const corrections = collectCorrections(
      await this.deps.resumes.list(userId),
      resumeId,
      undefined,
      resume.language,
    );
    // A vaga só orienta o que destacar: vai sem o texto bruto, só com o que foi analisado.
    const targetJob = resume.jobId ? await this.deps.jobs.find(userId, resume.jobId) : null;
    const jobForAi = targetJob
      ? {
          title: targetJob.title,
          company: targetJob.company,
          mustHave: targetJob.mustHave,
          niceToHave: targetJob.niceToHave,
        }
      : null;
    const promptInput = {
      facts: factsForAi,
      corrections,
      language: resume.language,
      ...(jobForAi ? { job: jobForAi } : {}),
    };
    try {
      const { data, usage } = await this.deps.ai.generateStructured({
        task: 'generate_resume',
        prompt: this.deps.prompt,
        promptInput,
        schema: ResumeOutput,
      });
      const { content, report } = buildResume(data, facts, [
        targetJob?.title ?? null,
        targetJob?.company ?? null,
      ]);
      await this.deps.resumes.saveDraft(userId, resumeId, content);
      await this.deps.generations.record({
        userId,
        task: 'generate_resume',
        usage,
        inputHash: createHash('sha256').update(JSON.stringify(promptInput)).digest('hex'),
        output: data,
        validation: { ...report },
      });
      await this.deps.audit.record({
        actorType: 'system',
        actorId: userId,
        action: 'resume.generated',
        entityType: 'resume',
        entityId: resumeId,
        metadata: {
          ...report,
          promptVersion: usage.promptVersion,
          correctionsEdited: corrections.edited.length,
          correctionsRemoved: corrections.removed.length,
        },
      });
      return 'draft';
    } catch (error) {
      if (opts.isLastAttempt) await this.fail(job, RESUME_FAILURES.processingError);
      throw error;
    }
  }

  private async fail(job: GenerateResumeJob, code: string): Promise<GenerateOutcome> {
    await this.deps.resumes.markFailed(job.userId, job.resumeId, code);
    await this.deps.quota.refund(job.userId, 'resume.improved', resumeUsageKey(job.resumeId));
    await this.deps.audit.record({
      actorType: 'system',
      actorId: job.userId,
      action: 'resume.failed',
      entityType: 'resume',
      entityId: job.resumeId,
      metadata: { failureCode: code },
    });
    return 'failed';
  }
}
