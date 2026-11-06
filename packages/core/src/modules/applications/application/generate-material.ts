import { createHash } from 'node:crypto';
import type { AiGenerationLog, AiProvider, AiTask, VersionedPrompt } from '../../ai';
import type { AuditLog } from '../../audit';
import type { JobRepository } from '../../jobs';
import type { ConsentService } from '../../privacy';
import type { FactRepository } from '../../profile';
import type { QuotaGate } from '../../shared';
import {
  buildMaterial,
  MATERIAL_FAILURES,
  MATERIAL_FEATURES,
  MATERIAL_OUTPUTS,
  materialPromptInput,
  materialUsageKey,
  type ApplicationMaterial,
  type GenerateMaterialJob,
  type MaterialKind,
} from '../domain/material';
import type { ApplicationRepository } from './application-service';
import type { MaterialRepository } from './material-service';

export interface GenerateMaterialDeps {
  materials: Pick<MaterialRepository, 'find' | 'list' | 'saveReady' | 'markFailed'>;
  applications: Pick<ApplicationRepository, 'find' | 'transition'>;
  jobs: Pick<JobRepository, 'find'>;
  facts: Pick<FactRepository, 'list'>;
  consents: Pick<ConsentService, 'status'>;
  ai: AiProvider;
  prompts: Record<MaterialKind, VersionedPrompt>;
  generations: Pick<AiGenerationLog, 'record'>;
  quota: Pick<QuotaGate, 'refund'>;
  audit: AuditLog;
}

export type MaterialOutcome = 'ready' | 'failed' | 'skipped';

const TASKS: Record<MaterialKind, AiTask> = {
  resume: 'generate_resume',
  cover_letter: 'generate_cover_letter',
  form_answers: 'answer_form',
};

/** Gera o material e confere cada frase contra os fatos. Roda no worker. */
export class GenerateMaterial {
  constructor(private readonly deps: GenerateMaterialDeps) {}

  async run(job: GenerateMaterialJob, opts: { isLastAttempt: boolean }): Promise<MaterialOutcome> {
    const { userId, applicationId, materialId } = job;
    const material = await this.deps.materials.find(userId, materialId);
    if (!material) return 'skipped';
    if (material.status !== 'generating') {
      // Nova tentativa depois de salvar: a candidatura não pode ficar presa em análise.
      await this.finish(job, 'material_ready');
      return 'skipped';
    }

    const { granted } = await this.deps.consents.status(userId);
    if (!granted.ai_processing) return this.fail(job, material, MATERIAL_FAILURES.consentRevoked);

    const application = await this.deps.applications.find(userId, applicationId);
    const vacancy = application?.jobId
      ? await this.deps.jobs.find(userId, application.jobId)
      : null;
    if (!vacancy) return this.fail(job, material, MATERIAL_FAILURES.jobDeleted);

    const facts = (await this.deps.facts.list(userId)).filter(
      (f) => f.verification === 'extracted' || f.verification === 'user_confirmed',
    );
    if (facts.length === 0) return this.fail(job, material, MATERIAL_FAILURES.noFacts);

    const promptInput = materialPromptInput(facts, vacancy, material.questions);
    try {
      const { data, usage } = await this.deps.ai.generateStructured<unknown>({
        task: TASKS[material.kind],
        prompt: this.deps.prompts[material.kind],
        promptInput,
        schema: MATERIAL_OUTPUTS[material.kind],
      });
      const { content, report } = buildMaterial({
        kind: material.kind,
        output: data,
        facts,
        job: { title: vacancy.title, company: vacancy.company },
        questions: material.questions,
      });
      await this.deps.materials.saveReady(userId, materialId, content);
      await this.deps.generations.record({
        userId,
        task: TASKS[material.kind],
        usage,
        inputHash: createHash('sha256').update(JSON.stringify(promptInput)).digest('hex'),
        output: data,
        validation: { ...report },
      });
      await this.deps.audit.record({
        actorType: 'system',
        actorId: userId,
        action: 'material.generated',
        entityType: 'application_material',
        entityId: materialId,
        metadata: { kind: material.kind, ...report, promptVersion: usage.promptVersion },
      });
      await this.finish(job, 'material_ready');
      return 'ready';
    } catch (error) {
      if (opts.isLastAttempt) await this.fail(job, material, MATERIAL_FAILURES.processingError);
      throw error;
    }
  }

  private async fail(
    job: GenerateMaterialJob,
    material: ApplicationMaterial,
    code: string,
  ): Promise<MaterialOutcome> {
    await this.deps.materials.markFailed(job.userId, job.materialId, code);
    await this.deps.quota.refund(
      job.userId,
      MATERIAL_FEATURES[material.kind],
      materialUsageKey(job.usageId),
    );
    await this.deps.audit.record({
      actorType: 'system',
      actorId: job.userId,
      action: 'material.failed',
      entityType: 'application_material',
      entityId: job.materialId,
      metadata: { failureCode: code },
    });
    await this.finish(job, 'material_failed');
    return 'failed';
  }

  /** Quando nada mais está sendo gerado, a candidatura segue para a revisão. */
  private async finish(job: GenerateMaterialJob, reason: string) {
    const all = await this.deps.materials.list(job.userId, job.applicationId);
    if (all.some((m) => m.status === 'generating')) return;
    await this.deps.applications.transition(job.userId, job.applicationId, 'analyzing', [
      { to: 'in_review', actor: 'system', reason },
    ]);
  }
}
