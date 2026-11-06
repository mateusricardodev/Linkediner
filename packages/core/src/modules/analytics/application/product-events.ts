import type { AuditEntry, AuditLog } from '../../audit';
import { eventsFromAudit, type ProductEvent } from '../domain/events';

export interface ProductEventStore {
  /** Pseudonimiza o usuário antes de gravar. Evento com chave repetida é ignorado. */
  insert(userId: string, events: ProductEvent[]): Promise<void>;
  deleteOlderThan(cutoff: Date): Promise<number>;
}

/** Métricas nunca derrubam um fluxo: uma falha aqui só é registrada no log. */
export class ProductEvents {
  constructor(
    private readonly store: Pick<ProductEventStore, 'insert'>,
    private readonly onError: (error: unknown) => void,
  ) {}

  async track(userId: string, events: ProductEvent[]): Promise<void> {
    if (events.length === 0) return;
    try {
      await this.store.insert(userId, events);
    } catch (error) {
      this.onError(error);
    }
  }
}

/**
 * Gera os eventos a partir da auditoria, que já marca cada passo importante. Assim, nenhum caso de
 * uso precisa saber de métricas. A auditoria continua obrigatória: a falha dela sobe normalmente.
 */
export class TrackingAuditLog implements AuditLog {
  constructor(
    private readonly inner: AuditLog,
    private readonly events: Pick<ProductEvents, 'track'>,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.inner.record(entry);
    if (entry.actorId) await this.events.track(entry.actorId, eventsFromAudit(entry));
  }
}
