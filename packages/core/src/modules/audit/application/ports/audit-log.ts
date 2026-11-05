export interface AuditEntry {
  actorType: 'user' | 'system' | 'admin';
  /** ID real do ator. É pseudonimizado antes de gravar. */
  actorId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  /** Nunca inclua dados pessoais aqui. */
  metadata?: Record<string, unknown>;
}

/** Registro de auditoria somente de inserção (docs/arquitetura/07-seguranca-e-privacidade.md). */
export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
}
