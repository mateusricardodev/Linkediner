import { AppError } from '../../shared';

export const DOCUMENT_KINDS = ['resume', 'linkedin_pdf'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export type DocumentStatus = 'pending_upload' | 'uploaded' | 'processing' | 'processed' | 'failed';

export const PDF_MIME = 'application/pdf';
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const DOCUMENT_RULES = {
  maxSizeBytes: 10 * 1024 * 1024,
  /** Retenção padrão de documentos (docs/arquitetura/07-seguranca-e-privacidade.md). */
  retentionDays: 30,
  uploadUrlTtlSeconds: 300,
  /** Upload iniciado e não concluído é descartado depois deste prazo. */
  pendingUploadTtlHours: 24,
  allowedMime: {
    resume: [PDF_MIME, DOCX_MIME],
    linkedin_pdf: [PDF_MIME],
  } satisfies Record<DocumentKind, string[]>,
} as const;

export interface DocumentRecord {
  id: string;
  kind: DocumentKind;
  status: DocumentStatus;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  failureCode: string | null;
  uploadedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

const invalid = (message: string, field?: string) =>
  new AppError('VALIDATION_FAILED', message, field ? { field } : undefined);

export const objectKeyFor = (userId: string, documentId: string) =>
  `users/${userId}/documents/${documentId}`;
export const userPrefix = (userId: string) => `users/${userId}/`;

export function validateUploadRequest(kind: DocumentKind, mimeType: string, sizeBytes: number) {
  const allowed: readonly string[] = DOCUMENT_RULES.allowedMime[kind];
  if (!allowed.includes(mimeType)) {
    throw invalid(
      kind === 'linkedin_pdf'
        ? 'O arquivo do LinkedIn deve ser um PDF.'
        : 'Envie um arquivo PDF ou DOCX.',
      'mimeType',
    );
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0)
    throw invalid('Tamanho de arquivo inválido.', 'sizeBytes');
  if (sizeBytes > DOCUMENT_RULES.maxSizeBytes)
    throw invalid('O arquivo deve ter no máximo 10 MB.', 'sizeBytes');
}

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((b, i) => bytes[i] === b);

/**
 * Verifica o conteúdo real do arquivo (não confia na extensão nem no tipo declarado).
 * PDF: assinatura %PDF-, sem criptografia e sem JavaScript embutido.
 * DOCX: arquivo ZIP que contém word/document.xml.
 */
export function inspectFileContent(declaredMime: string, bytes: Uint8Array): void {
  const text = Buffer.from(bytes).toString('latin1');
  if (declaredMime === PDF_MIME) {
    if (!startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]))
      throw invalid('O arquivo enviado não é um PDF válido.');
    if (/\/Encrypt\b/.test(text))
      throw invalid('O PDF está protegido por senha. Envie uma versão sem proteção.');
    if (/\/(JavaScript|JS)\b/.test(text))
      throw invalid('O PDF contém scripts embutidos e não pode ser processado.');
    return;
  }
  if (declaredMime === DOCX_MIME) {
    if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || !text.includes('word/document.xml')) {
      throw invalid('O arquivo enviado não é um DOCX válido.');
    }
    return;
  }
  throw invalid('Tipo de arquivo não suportado.');
}

export function expiresAtFrom(now: Date): Date {
  return new Date(now.getTime() + DOCUMENT_RULES.retentionDays * 24 * 60 * 60 * 1000);
}
