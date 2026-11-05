import type { AuditLog } from '../../audit';
import {
  computeConsentStatus,
  CURRENT_CONSENT_VERSIONS,
  type ConsentPurpose,
  type ConsentStatus,
} from '../domain/consent';
import type { ConsentRepository } from './ports/consent-repository';

export class ConsentService {
  constructor(
    private readonly repo: ConsentRepository,
    private readonly audit: AuditLog,
  ) {}

  async status(userId: string): Promise<ConsentStatus> {
    return computeConsentStatus(await this.repo.history(userId));
  }

  /** Registra uma decisão (concessão ou revogação) na versão vigente. O histórico nunca é sobrescrito. */
  async decide(userId: string, purpose: ConsentPurpose, granted: boolean): Promise<ConsentStatus> {
    const version = CURRENT_CONSENT_VERSIONS[purpose];
    await this.repo.append(userId, { purpose, version, granted });
    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: granted ? 'consent.granted' : 'consent.revoked',
      entityType: 'consent',
      metadata: { purpose, version },
    });
    return this.status(userId);
  }
}
