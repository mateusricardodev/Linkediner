import type { FileCheckReport } from '../../domain/file-check';
import type { DocumentKind, DocumentRecord, DocumentStatus } from '../../domain/document';

/** Operações do usuário: sempre com contexto de usuário (RLS). */
export interface DocumentRepository {
  insert(
    userId: string,
    doc: Omit<
      DocumentRecord,
      | 'sha256'
      | 'failureCode'
      | 'discardedFacts'
      | 'droppedFields'
      | 'fileCheck'
      | 'uploadedAt'
      | 'createdAt'
      | 'status'
    > & {
      kind: DocumentKind;
    },
  ): Promise<DocumentRecord>;
  find(userId: string, id: string): Promise<DocumentRecord | null>;
  list(userId: string): Promise<DocumentRecord[]>;
  markUploaded(
    userId: string,
    id: string,
    data: {
      sha256: string;
      sizeBytes: number;
      uploadedAt: Date;
      fileCheck: FileCheckReport | null;
    },
  ): Promise<DocumentRecord>;
  /** Muda o estado. O código de falha é limpo quando não informado. */
  setStatus(
    userId: string,
    id: string,
    status: DocumentStatus,
    failureCode?: string,
  ): Promise<void>;
  /** Conclui a análise, com o que a conferência deixou de fora. */
  markProcessed(
    userId: string,
    id: string,
    result: { discardedFacts: number; droppedFields: number },
  ): Promise<void>;
  delete(userId: string, id: string): Promise<boolean>;
}

/** Dados gerados a partir de um documento, apagados junto quando o usuário o exclui. */
export interface DocumentDerivedData {
  deleteForDocument(userId: string, documentId: string): Promise<void>;
}

/** Operações de sistema para retenção (worker), sem contexto de usuário. */
export interface DocumentRetentionRepository {
  /** Documentos vencidos e uploads pendentes abandonados. */
  findExpired(
    now: Date,
    pendingBefore: Date,
    limit: number,
  ): Promise<{ id: string; userId: string; objectKey: string }[]>;
  /** Apaga o registro e limpa os trechos do documento guardados nos fatos do perfil. */
  deleteById(id: string): Promise<void>;
}
