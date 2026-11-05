import type { AuditLog } from '../../audit';
import { AppError } from '../../shared';
import {
  FACT_DATA_SCHEMAS,
  fingerprintFact,
  type FactData,
  type ProfileFact,
} from '../domain/facts';
import type { FactRepository } from './ports/fact-repository';

export type FactDecision =
  { verification: 'user_confirmed'; data?: Record<string, unknown> } | { verification: 'rejected' };

/** O usuário é a autoridade sobre os próprios fatos: confirma, corrige ou recusa. */
export class FactService {
  constructor(
    private readonly repo: FactRepository,
    private readonly audit: AuditLog,
  ) {}

  list(userId: string): Promise<ProfileFact[]> {
    return this.repo.list(userId);
  }

  async decide(userId: string, factId: string, decision: FactDecision): Promise<ProfileFact> {
    const fact = await this.repo.find(userId, factId);
    if (!fact) throw new AppError('NOT_FOUND', 'Fato não encontrado.');

    let edit: { data: FactData; fingerprint: string } | undefined;
    if (decision.verification === 'user_confirmed' && decision.data) {
      const parsed = FACT_DATA_SCHEMAS[fact.type].safeParse(decision.data);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Os dados informados são inválidos para este fato.',
        );
      }
      const data = parsed.data as FactData;
      edit = { data, fingerprint: fingerprintFact(fact.type, data) };
    }

    const updated = await this.repo.update(userId, factId, {
      verification: decision.verification,
      ...edit,
    });
    if (!updated) throw new AppError('CONFLICT', 'Já existe um fato igual no seu perfil.');

    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: decision.verification === 'rejected' ? 'fact.rejected' : 'fact.confirmed',
      entityType: 'profile_fact',
      entityId: factId,
      metadata: { type: fact.type, edited: Boolean(edit) },
    });
    return updated;
  }
}
