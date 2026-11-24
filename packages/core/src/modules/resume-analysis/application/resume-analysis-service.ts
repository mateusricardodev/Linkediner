import type { AuditLog } from '../../audit';
import type { DocumentRepository } from '../../documents';
import type { ConsentService } from '../../privacy';
import type { ProfileRepository } from '../../profile';
import { AppError, newId, type QuotaGate } from '../../shared';
import {
  analysisUsageKey,
  RESUME_ANALYSIS_FAILURES,
  validateDoneActions,
  type ResumeAnalysis,
} from '../domain/analysis';
import type { ResumeAnalysisQueue, ResumeAnalysisRepository } from './ports';

export interface ResumeAnalysisServiceDeps {
  repo: ResumeAnalysisRepository;
  documents: Pick<DocumentRepository, 'find'>;
  goals: Pick<ProfileRepository, 'listGoals'>;
  consents: Pick<ConsentService, 'status'>;
  queue: ResumeAnalysisQueue;
  quota: QuotaGate;
  audit: AuditLog;
}

const notFound = () => new AppError('NOT_FOUND', 'Análise não encontrada.');

export class ResumeAnalysisService {
  constructor(private readonly deps: ResumeAnalysisServiceDeps) {}

  /** Pede a análise de um currículo já enviado. A análise roda no worker. */
  async request(userId: string, documentId: string): Promise<ResumeAnalysis> {
    const { granted } = await this.deps.consents.status(userId);
    if (!granted.ai_processing) {
      throw new AppError(
        'CONSENT_REQUIRED',
        'Autorize o processamento por IA para analisar o seu currículo.',
        { missing: ['ai_processing'] },
      );
    }
    const document = await this.deps.documents.find(userId, documentId);
    if (!document || document.status === 'pending_upload') {
      throw new AppError('NOT_FOUND', 'Documento não encontrado.');
    }
    if (document.kind !== 'resume') {
      throw new AppError('VALIDATION_FAILED', 'Envie o arquivo do seu currículo.', {
        field: 'documentId',
      });
    }

    // Dois cliques no mesmo envio não gastam duas análises.
    const running = (await this.deps.repo.list(userId)).find(
      (a) => a.status === 'processing' && a.documentId === documentId,
    );
    if (running) return running;

    const goals = await this.deps.goals.listGoals(userId);
    const targetRole = goals.find((goal) => goal.isActive)?.title ?? null;

    const id = newId();
    await this.deps.quota.consume(userId, 'resume.analysis', analysisUsageKey(id));
    const analysis = await this.deps.repo.insertProcessing(userId, { id, documentId, targetRole });
    try {
      await this.deps.queue.enqueue({ userId, analysisId: id });
    } catch {
      await this.deps.repo.markFailed(userId, id, RESUME_ANALYSIS_FAILURES.processingError);
      await this.deps.quota.refund(userId, 'resume.analysis', analysisUsageKey(id));
      throw new AppError(
        'DEPENDENCY_UNAVAILABLE',
        'Não foi possível iniciar a análise. Tente de novo.',
      );
    }
    await this.deps.audit.record({
      actorType: 'user',
      actorId: userId,
      action: 'resume_analysis.requested',
      entityType: 'resume.analysis',
      entityId: id,
      metadata: { hasTargetRole: targetRole !== null },
    });
    return analysis;
  }

  list(userId: string): Promise<ResumeAnalysis[]> {
    return this.deps.repo.list(userId);
  }

  async get(userId: string, id: string): Promise<ResumeAnalysis> {
    const analysis = await this.deps.repo.find(userId, id);
    if (!analysis) throw notFound();
    return analysis;
  }

  /** Guarda o checklist marcado pela pessoa. */
  async setDoneActions(userId: string, id: string, done: string[]): Promise<string[]> {
    const analysis = await this.deps.repo.find(userId, id);
    if (!analysis) throw notFound();
    const doneActions = validateDoneActions(analysis.result, done);
    await this.deps.repo.setDoneActions(userId, id, doneActions);
    return doneActions;
  }
}
