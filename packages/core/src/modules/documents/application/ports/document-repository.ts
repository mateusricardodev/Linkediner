import type { DocumentKind, DocumentRecord, DocumentStatus } from '../../domain/document';

/** Operações do usuário: sempre com contexto de usuário (RLS). */
export interface DocumentRepository {
  insert(
    userId: string,
    doc: Omit<DocumentRecord, 'sha256' | 'uploadedAt' | 'createdAt' | 'status'> & {
      kind: DocumentKind;
    },
  ): Promise<DocumentRecord>;
  find(userId: string, id: string): Promise<DocumentRecord | null>;
  list(userId: string): Promise<DocumentRecord[]>;
  markUploaded(
    userId: string,
    id: string,
    data: { sha256: string; sizeBytes: number; uploadedAt: Date },
  ): Promise<DocumentRecord>;
  setStatus(userId: string, id: string, status: DocumentStatus): Promise<void>;
  delete(userId: string, id: string): Promise<boolean>;
}

/** Operações de sistema para retenção (worker), sem contexto de usuário. */
export interface DocumentRetentionRepository {
  /** Documentos vencidos e uploads pendentes abandonados. */
  findExpired(
    now: Date,
    pendingBefore: Date,
    limit: number,
  ): Promise<{ id: string; userId: string; objectKey: string }[]>;
  deleteById(id: string): Promise<void>;
}
