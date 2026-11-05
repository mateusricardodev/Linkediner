import type { DocumentRecord, DocumentRepository } from '../../documents';
import type { ConsentService } from '../../privacy';
import { AppError, isAppError } from '../../shared';
import type { ExtractionQueue } from './ports';

/** Pedido de extração feito pela API. O trabalho em si roda no worker. */
export class ExtractionRequests {
  constructor(
    private readonly documents: Pick<DocumentRepository, 'find' | 'setStatus'>,
    private readonly consents: Pick<ConsentService, 'status'>,
    private readonly queue: ExtractionQueue,
  ) {}

  /** Sem consentimento de processamento por IA, nada é enviado ao provedor. */
  async request(userId: string, documentId: string): Promise<DocumentRecord> {
    const document = await this.documents.find(userId, documentId);
    if (!document) throw new AppError('NOT_FOUND', 'Documento não encontrado.');
    if (document.status === 'pending_upload') {
      throw new AppError('CONFLICT', 'O arquivo ainda não foi enviado.');
    }
    if (document.status === 'processing' || document.status === 'processed') return document;

    const { granted } = await this.consents.status(userId);
    if (!granted.ai_processing) {
      throw new AppError(
        'CONSENT_REQUIRED',
        'Autorize o processamento por IA para analisar o documento.',
        {
          missing: ['ai_processing'],
        },
      );
    }

    await this.documents.setStatus(userId, documentId, 'processing');
    try {
      await this.queue.enqueue({ userId, documentId });
    } catch {
      await this.documents.setStatus(userId, documentId, 'uploaded');
      throw new AppError(
        'DEPENDENCY_UNAVAILABLE',
        'Não foi possível iniciar a análise. Tente de novo.',
      );
    }
    return { ...document, status: 'processing', failureCode: null };
  }

  /**
   * Inicia a extração logo depois do upload, se o usuário já autorizou. O upload continua válido
   * sem autorização ou se a fila falhar: dá para pedir a análise depois.
   */
  async requestIfAllowed(userId: string, document: DocumentRecord): Promise<DocumentRecord> {
    try {
      return await this.request(userId, document.id);
    } catch (error) {
      if (
        isAppError(error) &&
        (error.code === 'CONSENT_REQUIRED' || error.code === 'DEPENDENCY_UNAVAILABLE')
      ) {
        return document;
      }
      throw error;
    }
  }
}
