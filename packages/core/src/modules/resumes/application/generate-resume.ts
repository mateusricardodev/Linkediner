import { createHash } from 'node:crypto';
import type { AiGenerationLog, AiProvider, VersionedPrompt } from '../../ai';
import type { AuditLog } from '../../audit';
import type { ConsentService } from '../../privacy';
import type { FactRepository } from '../../profile';
import {
  buildResume,
  RESUME_FAILURES,
  ResumeOutput,
  type GenerateResumeJob,
} from '../domain/resume';
import type { ResumeRepository } from './ports/resume-repository';

export interface GenerateResumeDeps {
  resumes: Pick<ResumeRepository, 'find' | 'saveDraft' | 'markFailed'>;
  facts: Pick<FactRepository, 'list'>;
  consents: Pick<ConsentService, 'status'>;
  ai: AiProvider;
  prompt: VersionedPrompt;
  generations: Pick<AiGenerationLog, 'record'>;
  audit: AuditLog;
}

export type GenerateOutcome = 'draft' | 'failed' | 'skipped';

/** Gera a redação com IA e confere cada frase contra os fatos. Roda no worker. */
export class GenerateResume {
  constructor(private readonly deps: GenerateResumeDeps) {}

  async run(job: GenerateResumeJob, opts: { isLastAttempt: boolean }): Promise<GenerateOutcome> {
    const { userId, resumeId } = job;
    const resume = await this.deps.resumes.find(userId, resumeId);
    if (!resume || resume.status !== 'generating') return 'skipped';

    const { granted } = await this.deps.consents.status(userId);
    if (!granted.ai_processing) return this.fail(job, RESUME_FAILURES.consentRevoked);

    const facts = (await this.deps.facts.list(userId)).filter(
      (f) => f.verification === 'extracted' || f.verification === 'user_confirmed',
    );
    if (facts.length === 0) return this.fail(job, RESUME_FAILURES.noFacts);

    // Só o necessário: sem os trechos do documento original.
    const factsForAi = facts.map(({ id, type, data }) => ({ id, type, data }));
    try {
      const { data, usage } = await this.deps.ai.generateStructured({
        task: 'generate_resume',
        prompt: this.deps.prompt,
        promptInput: { facts: factsForAi },
        schema: ResumeOutput,
      });
      const { content, report } = buildResume(data, facts);
      await this.deps.resumes.saveDraft(userId, resumeId, content);
      await this.deps.generations.record({
        userId,
        task: 'generate_resume',
        usage,
        inputHash: createHash('sha256').update(JSON.stringify(factsForAi)).digest('hex'),
        output: data,
        validation: { ...report },
      });
      await this.deps.audit.record({
        actorType: 'system',
        actorId: userId,
        action: 'resume.generated',
        entityType: 'resume',
        entityId: resumeId,
        metadata: { ...report, promptVersion: usage.promptVersion },
      });
      return 'draft';
    } catch (error) {
      if (opts.isLastAttempt) await this.fail(job, RESUME_FAILURES.processingError);
      throw error;
    }
  }

  private async fail(job: GenerateResumeJob, code: string): Promise<GenerateOutcome> {
    await this.deps.resumes.markFailed(job.userId, job.resumeId, code);
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
