import type { Resume, ResumeContent } from '../../domain/resume';

/** Toda operação usa o contexto do usuário dono (RLS). */
export interface ResumeRepository {
  insertGenerating(userId: string, id: string): Promise<Resume>;
  find(userId: string, id: string): Promise<Resume | null>;
  list(userId: string): Promise<Resume[]>;
  saveDraft(userId: string, id: string, content: ResumeContent): Promise<void>;
  markFailed(userId: string, id: string, failureCode: string): Promise<void>;
  /** Altera o conteúdo numa transação com bloqueio, para duas edições não se sobrescreverem. */
  updateContent(
    userId: string,
    id: string,
    change: (content: ResumeContent) => void,
  ): Promise<Resume | null>;
  delete(userId: string, id: string): Promise<boolean>;
}

/** Enfileira a geração. O payload leva só IDs. */
export interface ResumeQueue {
  enqueue(job: { userId: string; resumeId: string }): Promise<void>;
}
