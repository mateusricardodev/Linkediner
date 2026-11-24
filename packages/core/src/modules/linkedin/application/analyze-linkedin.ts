import { createHash } from 'node:crypto';
import type { AiGenerationLog, AiProvider, VersionedPrompt } from '../../ai';
import type { AuditLog } from '../../audit';
import type { DocumentRepository, ObjectStorage } from '../../documents';
import { redactSensitiveData, TEXT_LIMITS, type TextExtractor } from '../../extraction';
import type { ConsentService } from '../../privacy';
import type { QuotaGate } from '../../shared';
import {
  AnalysisOutput,
  analysisUsageKey,
  buildResult,
  LINKEDIN_ANALYSIS_FAILURES,
  type AnalyzeLinkedinJob,
} from '../domain/analysis';
import type { LinkedinAnalysisRepository } from './ports';

export interface AnalyzeLinkedinDeps {
  analyses: Pick<LinkedinAnalysisRepository, 'find' | 'saveReady' | 'markFailed'>;
  documents: Pick<DocumentRepository, 'find'>;
  storage: Pick<ObjectStorage, 'getBytes'>;
  text: TextExtractor;
  consents: Pick<ConsentService, 'status'>;
  users: { getById(userId: string): Promise<{ name: string | null } | null> };
  ai: AiProvider;
  prompt: VersionedPrompt;
  generations: Pick<AiGenerationLog, 'record'>;
  quota: Pick<QuotaGate, 'refund'>;
  audit: AuditLog;
}

export type AnalyzeOutcome = 'ready' | 'failed' | 'skipped';

/**
 * Analisa o perfil do LinkedIn com IA. Roda no worker e é seguro repetir. Erros transitórios sobem
 * para a fila tentar de novo; problemas do próprio arquivo marcam a análise como falha.
 * Só conta no limite do plano a análise que deu certo.
 */
export class AnalyzeLinkedin {
  constructor(private readonly deps: AnalyzeLinkedinDeps) {}

  async run(job: AnalyzeLinkedinJob, opts: { isLastAttempt: boolean }): Promise<AnalyzeOutcome> {
    const { userId, analysisId } = job;
    const analysis = await this.deps.analyses.find(userId, analysisId);
    if (!analysis) {
      await this.refund(job);
      return 'skipped';
    }
    if (analysis.status !== 'processing') return 'skipped';

    const { granted } = await this.deps.consents.status(userId);
    if (!granted.ai_processing) return this.fail(job, LINKEDIN_ANALYSIS_FAILURES.consentRevoked);

    const document = analysis.documentId
      ? await this.deps.documents.find(userId, analysis.documentId)
      : null;
    if (!document) return this.fail(job, LINKEDIN_ANALYSIS_FAILURES.documentMissing);

    try {
      let raw: string;
      try {
        raw = await this.deps.text.extract(
          document.mimeType,
          await this.deps.storage.getBytes(document.objectKey),
        );
      } catch {
        return this.fail(job, LINKEDIN_ANALYSIS_FAILURES.unreadable);
      }
      if (raw.trim().length < TEXT_LIMITS.minChars)
        return this.fail(job, LINKEDIN_ANALYSIS_FAILURES.noText);

      const owner = await this.deps.users.getById(userId);
      const profileText = redactSensitiveData(raw.slice(0, TEXT_LIMITS.maxChars), owner?.name);
      const { data, usage } = await this.deps.ai.generateStructured({
        task: 'analyze_linkedin',
        prompt: this.deps.prompt,
        promptInput: { profileText, targetRole: analysis.targetRole },
        schema: AnalysisOutput,
      });
      const { result, droppedRewrites } = buildResult(data, profileText);
      await this.deps.analyses.saveReady(userId, analysisId, result);

      await this.deps.generations.record({
        userId,
        task: 'analyze_linkedin',
        usage,
        inputHash: createHash('sha256').update(profileText).digest('hex'),
        output: data,
        validation: { sections: result.sections.length, droppedRewrites },
      });
      await this.deps.audit.record({
        actorType: 'system',
        actorId: userId,
        action: 'linkedin_analysis.ready',
        entityType: 'linkedin_analysis',
        entityId: analysisId,
        metadata: { score: result.score, droppedRewrites, promptVersion: usage.promptVersion },
      });
      return 'ready';
    } catch (error) {
      if (opts.isLastAttempt) await this.fail(job, LINKEDIN_ANALYSIS_FAILURES.processingError);
      throw error;
    }
  }

  private refund(job: AnalyzeLinkedinJob) {
    return this.deps.quota.refund(
      job.userId,
      'linkedin.analysis',
      analysisUsageKey(job.analysisId),
    );
  }

  private async fail(job: AnalyzeLinkedinJob, code: string): Promise<AnalyzeOutcome> {
    await this.deps.analyses.markFailed(job.userId, job.analysisId, code);
    await this.refund(job);
    await this.deps.audit.record({
      actorType: 'system',
      actorId: job.userId,
      action: 'linkedin_analysis.failed',
      entityType: 'linkedin_analysis',
      entityId: job.analysisId,
      metadata: { failureCode: code },
    });
    return 'failed';
  }
}
