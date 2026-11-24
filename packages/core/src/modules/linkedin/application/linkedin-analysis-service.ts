import type { AuditLog } from '../../audit';
import type { DocumentRepository } from '../../documents';
import type { ConsentService } from '../../privacy';
import type { ProfileRepository } from '../../profile';
import { AppError, newId, type FeatureKey, type QuotaGate } from '../../shared';
import {
  analysisUsageKey,
  LINKEDIN_ANALYSIS_FAILURES,
  validateDoneActions,
  type LinkedinAnalysis,
} from '../domain/analysis';
import type { LinkedinAnalysisQueue, LinkedinAnalysisRepository } from './ports';

export interface LinkedinAnalysisServiceDeps {
  repo: LinkedinAnalysisRepository;
  documents: Pick<DocumentRepository, 'find'>;
  goals: Pick<ProfileRepository, 'listGoals'>;
  consents: Pick<ConsentService, 'status'>;
  queue: LinkedinAnalysisQueue;
  quota: QuotaGate;
  /** Recursos do plano que não têm contagem, como o texto pronto. */
  features: { enabled(userId: string, feature: FeatureKey): Promise<boolean> };
  audit: AuditLog;
}

/** A análise como a pessoa vê: sem o texto pronto quando o plano não inclui. */
export interface LinkedinAnalysisView extends LinkedinAnalysis {
  rewritesLocked: boolean;
}

const notFound = () => new AppError('NOT_FOUND', 'Análise não encontrada.');

export class LinkedinAnalysisService {
  constructor(private readonly deps: LinkedinAnalysisServiceDeps) {}

  /** Pede a análise de um PDF do LinkedIn já enviado. A análise roda no worker. */
  async request(userId: string, documentId: string): Promise<LinkedinAnalysis> {
    const { granted } = await this.deps.consents.status(userId);
    if (!granted.ai_processing) {
      throw new AppError(
        'CONSENT_REQUIRED',
        'Autorize o processamento por IA para analisar o seu perfil.',
        { missing: ['ai_processing'] },
      );
    }
    const document = await this.deps.documents.find(userId, documentId);
    if (!document || document.status === 'pending_upload') {
      throw new AppError('NOT_FOUND', 'Documento não encontrado.');
    }
    if (document.kind !== 'linkedin_pdf') {
      throw new AppError('VALIDATION_FAILED', 'Envie o PDF do seu perfil do LinkedIn.', {
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
    await this.deps.quota.consume(userId, 'linkedin.analysis', analysisUsageKey(id));
    const analysis = await this.deps.repo.insertProcessing(userId, { id, documentId, targetRole });
    try {
      await this.deps.queue.enqueue({ userId, analysisId: id });
    } catch {
      await this.deps.repo.markFailed(userId, id, LINKEDIN_ANALYSIS_FAILURES.processingError);
      await this.deps.quota.refund(userId, 'linkedin.analysis', analysisUsageKey(id));
      throw new AppError(
        'DEPENDENCY_UNAVAILABLE',
        'Não foi possível iniciar a análise. Tente de novo.',
      );
    }
    await this.deps.audit.record({
      actorType: 'user',
      actorId: userId,
      action: 'linkedin_analysis.requested',
      entityType: 'linkedin_analysis',
      entityId: id,
      metadata: { hasTargetRole: targetRole !== null },
    });
    return analysis;
  }

  list(userId: string): Promise<LinkedinAnalysis[]> {
    return this.deps.repo.list(userId);
  }

  async get(userId: string, id: string): Promise<LinkedinAnalysisView> {
    const analysis = await this.deps.repo.find(userId, id);
    if (!analysis) throw notFound();
    const unlocked = await this.deps.features.enabled(userId, 'linkedin.rewrites');
    if (unlocked || !analysis.result) return { ...analysis, rewritesLocked: !unlocked };
    // O texto pronto é do plano pago: sem ele, a análise vai sem o texto, só com o aviso.
    return {
      ...analysis,
      rewritesLocked: true,
      result: {
        ...analysis.result,
        sections: analysis.result.sections.map((section) => ({ ...section, rewrite: null })),
      },
    };
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
