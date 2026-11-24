import type { AnalysisResult, AnalyzeResumeJob, ResumeAnalysis } from '../domain/analysis';

/** Toda operação usa o contexto do usuário dono (RLS). */
export interface ResumeAnalysisRepository {
  insertProcessing(
    userId: string,
    analysis: { id: string; documentId: string; targetRole: string | null },
  ): Promise<ResumeAnalysis>;
  find(userId: string, id: string): Promise<ResumeAnalysis | null>;
  /** Da mais nova para a mais antiga. */
  list(userId: string): Promise<ResumeAnalysis[]>;
  saveReady(userId: string, id: string, result: AnalysisResult): Promise<void>;
  markFailed(userId: string, id: string, failureCode: string): Promise<void>;
  setDoneActions(userId: string, id: string, doneActions: string[]): Promise<void>;
}

/** Enfileira a análise. O payload leva só IDs. */
export interface ResumeAnalysisQueue {
  enqueue(job: AnalyzeResumeJob): Promise<void>;
}
