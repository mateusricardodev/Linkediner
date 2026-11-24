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
  RESUME_ANALYSIS_FAILURES,
  type AnalyzeResumeJob,
} from '../domain/analysis';
import type { ResumeAnalysisRepository } from './ports';

export interface AnalyzeResumeDeps {
  analyses: Pick<ResumeAnalysisRepository, 'find' | 'saveReady' | 'markFailed'>;
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
 * Analisa o currículo com IA, junto da conferência do arquivo (ADR 0028). Roda no worker e é seguro repetir. Erros transitórios sobem
 * para a fila tentar de novo; problemas do próprio arquivo marcam a análise como falha.
 * Só conta no limite do plano a análise que deu certo.
 */
export class AnalyzeResume {
  constructor(private readonly deps: AnalyzeResumeDeps) {}

  async run(job: AnalyzeResumeJob, opts: { isLastAttempt: boolean }): Promise<AnalyzeOutcome> {
    const { userId, analysisId } = job;
    const analysis = await this.deps.analyses.find(userId, analysisId);
    if (!analysis) {
      await this.refund(job);
      return 'skipped';
    }
    if (analysis.status !== 'processing') return 'skipped';

    const { granted } = await this.deps.consents.status(userId);
    if (!granted.ai_processing) return this.fail(job, RESUME_ANALYSIS_FAILURES.consentRevoked);

    const document = analysis.documentId
      ? await this.deps.documents.find(userId, analysis.documentId)
      : null;
    if (!document) return this.fail(job, RESUME_ANALYSIS_FAILURES.documentMissing);

    try {
      let raw: string;
      try {
        raw = await this.deps.text.extract(
          document.mimeType,
          await this.deps.storage.getBytes(document.objectKey),
        );
      } catch {
        return this.fail(job, RESUME_ANALYSIS_FAILURES.unreadable);
      }
      if (raw.trim().length < TEXT_LIMITS.minChars)
        return this.fail(job, RESUME_ANALYSIS_FAILURES.noText);

      const owner = await this.deps.users.getById(userId);
      const resumeText = redactSensitiveData(raw.slice(0, TEXT_LIMITS.maxChars), owner?.name);
      const { data, usage } = await this.deps.ai.generateStructured({
        task: 'analyze_resume',
        prompt: this.deps.prompt,
        promptInput: { resumeText, targetRole: analysis.targetRole },
        schema: AnalysisOutput,
      });
      const result = buildResult(data, document.fileCheck);
      await this.deps.analyses.saveReady(userId, analysisId, result);

      await this.deps.generations.record({
        userId,
        task: 'analyze_resume',
        usage,
        inputHash: createHash('sha256').update(resumeText).digest('hex'),
        output: data,
        validation: { sections: result.sections.length, hasFileCheck: document.fileCheck !== null },
      });
      await this.deps.audit.record({
        actorType: 'system',
        actorId: userId,
        action: 'resume_analysis.ready',
        entityType: 'resume.analysis',
        entityId: analysisId,
        metadata: { score: result.score, promptVersion: usage.promptVersion },
      });
      return 'ready';
    } catch (error) {
      if (opts.isLastAttempt) await this.fail(job, RESUME_ANALYSIS_FAILURES.processingError);
      throw error;
    }
  }

  private refund(job: AnalyzeResumeJob) {
    return this.deps.quota.refund(job.userId, 'resume.analysis', analysisUsageKey(job.analysisId));
  }

  private async fail(job: AnalyzeResumeJob, code: string): Promise<AnalyzeOutcome> {
    await this.deps.analyses.markFailed(job.userId, job.analysisId, code);
    await this.refund(job);
    await this.deps.audit.record({
      actorType: 'system',
      actorId: job.userId,
      action: 'resume_analysis.failed',
      entityType: 'resume.analysis',
      entityId: job.analysisId,
      metadata: { failureCode: code },
    });
    return 'failed';
  }
}
