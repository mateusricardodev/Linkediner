import type { ScoreResult } from '../../domain/score';

export interface StoredScore extends ScoreResult {
  createdAt: Date;
}

/** Toda operação usa o contexto do usuário dono (RLS). */
export interface ScoreRepository {
  /** Do mais recente para o mais antigo. */
  history(userId: string, limit: number): Promise<StoredScore[]>;
  append(userId: string, profileId: string, score: ScoreResult): Promise<StoredScore>;
}
