import type { FactData, FactVerification, NewFact, ProfileFact } from '../../domain/facts';

/** Toda operação usa o contexto do usuário dono (RLS). */
export interface FactRepository {
  list(userId: string): Promise<ProfileFact[]>;
  find(userId: string, factId: string): Promise<ProfileFact | null>;
  /**
   * Substitui, numa transação, os fatos ainda não confirmados de um documento (reprocessar é seguro).
   * Fatos já existentes com a mesma identidade são preservados, inclusive os recusados pelo usuário.
   */
  replaceExtracted(
    userId: string,
    documentId: string,
    facts: NewFact[],
  ): Promise<{ inserted: number }>;
  /** Devolve null se a alteração colidir com outro fato igual do usuário. */
  update(
    userId: string,
    factId: string,
    change: { verification: FactVerification; data?: FactData; fingerprint?: string },
  ): Promise<ProfileFact | null>;
  /** Remove os fatos não confirmados que vieram de um documento apagado pelo usuário. */
  deleteUnconfirmedForDocument(userId: string, documentId: string): Promise<void>;
}
