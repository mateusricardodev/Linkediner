import { createHash } from 'node:crypto';
import type { AuditLog } from '../../audit';
import { AppError, newId, systemClock, type Clock } from '../../shared';
import {
  DOCUMENT_RULES,
  expiresAtFrom,
  inspectFileContent,
  objectKeyFor,
  validateUploadRequest,
  type DocumentKind,
  type DocumentRecord,
} from '../domain/document';
import { evaluateFileCheck, type FileCheckReport, type FileSignals } from '../domain/file-check';
import type { DocumentDerivedData, DocumentRepository } from './ports/document-repository';
import type { ObjectStorage } from './ports/object-storage';

const notFound = () => new AppError('NOT_FOUND', 'Documento não encontrado.');

/** Lê os sinais do arquivo para a conferência ATS. Nulo quando o formato não se aplica. */
export interface FileSignalsPort {
  read(mimeType: string, bytes: Uint8Array): Promise<FileSignals | null>;
}

export class DocumentService {
  constructor(
    private readonly repo: DocumentRepository,
    private readonly storage: ObjectStorage,
    private readonly audit: AuditLog,
    private readonly derivedData: DocumentDerivedData,
    private readonly fileSignals: FileSignalsPort,
    private readonly clock: Clock = systemClock,
  ) {}

  /**
   * Passo 1: registra o documento e devolve a URL assinada para o navegador enviar o arquivo
   * direto ao storage. A API não trafega o arquivo.
   */
  async requestUpload(
    userId: string,
    input: { kind: DocumentKind; mimeType: string; sizeBytes: number },
  ) {
    validateUploadRequest(input.kind, input.mimeType, input.sizeBytes);
    const id = newId();
    const objectKey = objectKeyFor(userId, id);
    const document = await this.repo.insert(userId, {
      id,
      kind: input.kind,
      objectKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      expiresAt: expiresAtFrom(this.clock.now()),
    });
    const uploadUrl = await this.storage.presignUpload(objectKey, {
      contentType: input.mimeType,
      contentLength: input.sizeBytes,
      expiresInSeconds: DOCUMENT_RULES.uploadUrlTtlSeconds,
    });
    return {
      document,
      upload: {
        url: uploadUrl,
        method: 'PUT' as const,
        headers: { 'content-type': input.mimeType },
        expiresInSeconds: DOCUMENT_RULES.uploadUrlTtlSeconds,
      },
    };
  }

  /**
   * Passo 2: confirma o upload. Confere tamanho e conteúdo real do arquivo e calcula o hash.
   * Arquivo inválido é apagado na hora.
   */
  async completeUpload(userId: string, id: string): Promise<DocumentRecord> {
    const doc = await this.repo.find(userId, id);
    if (!doc) throw notFound();
    if (doc.status !== 'pending_upload') return doc;

    const head = await this.storage.head(doc.objectKey);
    if (!head) throw new AppError('CONFLICT', 'O arquivo ainda não foi enviado.');

    try {
      if (head.sizeBytes !== doc.sizeBytes || head.sizeBytes > DOCUMENT_RULES.maxSizeBytes) {
        throw new AppError('VALIDATION_FAILED', 'O tamanho do arquivo enviado não confere.');
      }
      const bytes = await this.storage.getBytes(doc.objectKey);
      inspectFileContent(doc.mimeType, bytes);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const fileCheck = doc.kind === 'resume' ? await this.checkFile(doc.mimeType, bytes) : null;
      const updated = await this.repo.markUploaded(userId, id, {
        sha256,
        sizeBytes: bytes.byteLength,
        uploadedAt: this.clock.now(),
        fileCheck,
      });
      await this.audit.record({
        actorType: 'user',
        actorId: userId,
        action: 'document.uploaded',
        entityType: 'document',
        entityId: id,
        metadata: { kind: doc.kind },
      });
      return updated;
    } catch (error) {
      await this.storage.delete(doc.objectKey);
      await this.repo.delete(userId, id);
      throw error;
    }
  }

  /**
   * Conferência ATS do arquivo, sem IA. O PDF do LinkedIn fica de fora: o layout é do LinkedIn.
   * Se o arquivo não puder ser medido, o envio segue normalmente, só sem a conferência.
   */
  private async checkFile(mimeType: string, bytes: Uint8Array): Promise<FileCheckReport | null> {
    try {
      const signals = await this.fileSignals.read(mimeType, bytes);
      return signals ? evaluateFileCheck(signals) : null;
    } catch {
      return null;
    }
  }

  list(userId: string): Promise<DocumentRecord[]> {
    return this.repo.list(userId);
  }

  async get(userId: string, id: string): Promise<DocumentRecord> {
    const doc = await this.repo.find(userId, id);
    if (!doc) throw notFound();
    return doc;
  }

  async downloadUrl(userId: string, id: string): Promise<string> {
    const doc = await this.get(userId, id);
    if (doc.status === 'pending_upload')
      throw new AppError('CONFLICT', 'O arquivo ainda não foi enviado.');
    const ext = doc.mimeType === 'application/pdf' ? 'pdf' : 'docx';
    return this.storage.presignDownload(doc.objectKey, {
      expiresInSeconds: 60,
      fileName: `${doc.kind}.${ext}`,
    });
  }

  /** Exclusão imediata a pedido do usuário: dados derivados não confirmados, arquivo e registro. */
  async delete(userId: string, id: string): Promise<void> {
    const doc = await this.repo.find(userId, id);
    if (!doc) throw notFound();
    await this.derivedData.deleteForDocument(userId, id);
    await this.storage.delete(doc.objectKey);
    await this.repo.delete(userId, id);
    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: 'document.deleted',
      entityType: 'document',
      entityId: id,
    });
  }
}
