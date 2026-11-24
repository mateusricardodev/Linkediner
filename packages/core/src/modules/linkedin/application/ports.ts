import type { AnalysisResult, AnalyzeLinkedinJob, LinkedinAnalysis } from '../domain/analysis';

/** Toda operação usa o contexto do usuário dono (RLS). */
export interface LinkedinAnalysisRepository {
  insertProcessing(
    userId: string,
    analysis: { id: string; documentId: string; targetRole: string | null },
  ): Promise<LinkedinAnalysis>;
  find(userId: string, id: string): Promise<LinkedinAnalysis | null>;
  /** Da mais nova para a mais antiga. */
  list(userId: string): Promise<LinkedinAnalysis[]>;
  saveReady(userId: string, id: string, result: AnalysisResult): Promise<void>;
  markFailed(userId: string, id: string, failureCode: string): Promise<void>;
  setDoneActions(userId: string, id: string, doneActions: string[]): Promise<void>;
}

/** Enfileira a análise. O payload leva só IDs. */
export interface LinkedinAnalysisQueue {
  enqueue(job: AnalyzeLinkedinJob): Promise<void>;
}
