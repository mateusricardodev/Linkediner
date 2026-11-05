import type { AuditLog } from '../../audit';
import { systemClock, type Clock } from '../../shared';
import { DOCUMENT_RULES } from '../domain/document';
import type { DocumentRetentionRepository } from './ports/document-repository';
import type { ObjectStorage } from './ports/object-storage';

/**
 * Aplica a retenção de 30 dias (ADR 0008): apaga arquivo e registro de documentos vencidos
 * e de uploads iniciados e nunca concluídos. Roda diariamente no worker.
 */
export class ExpireDocuments {
  constructor(
    private readonly repo: DocumentRetentionRepository,
    private readonly storage: ObjectStorage,
    private readonly audit: AuditLog,
    private readonly clock: Clock = systemClock,
  ) {}

  async run(batchSize = 200): Promise<{ deleted: number }> {
    const now = this.clock.now();
    const pendingBefore = new Date(
      now.getTime() - DOCUMENT_RULES.pendingUploadTtlHours * 60 * 60 * 1000,
    );
    let deleted = 0;
    for (;;) {
      const batch = await this.repo.findExpired(now, pendingBefore, batchSize);
      for (const doc of batch) {
        await this.storage.delete(doc.objectKey);
        await this.repo.deleteById(doc.id);
        await this.audit.record({
          actorType: 'system',
          actorId: doc.userId,
          action: 'document.expired',
          entityType: 'document',
          entityId: doc.id,
        });
        deleted++;
      }
      if (batch.length < batchSize) return { deleted };
    }
  }
}
