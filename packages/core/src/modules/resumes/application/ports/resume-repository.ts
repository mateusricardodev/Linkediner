import type { Resume, ResumeContent, ResumeOptions } from '../../domain/resume';

/** Toda operação usa o contexto do usuário dono (RLS). */
export interface ResumeRepository {
  insertGenerating(userId: string, id: string, options: ResumeOptions): Promise<Resume>;
  find(userId: string, id: string): Promise<Resume | null>;
  list(userId: string): Promise<Resume[]>;
  saveDraft(userId: string, id: string, content: ResumeContent): Promise<void>;
  markFailed(userId: string, id: string, failureCode: string): Promise<void>;
  /** Marca como aprovado. Devolve null se o currículo não estiver mais em rascunho. */
  approve(userId: string, id: string, at: Date): Promise<Resume | null>;
  /**
   * Altera o conteúdo numa transação com bloqueio, para duas edições não se sobrescreverem.
   * Alterar um currículo aprovado o devolve a rascunho: a aprovação vale só para o que foi revisado.
   */
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
