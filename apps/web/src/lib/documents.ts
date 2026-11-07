import { api, ApiError } from './api';
import type { DocumentKind, DocumentRecord, RequestUpload } from './types';

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_KINDS: Record<
  DocumentKind,
  { title: string; formats: string; accept: string; hint: string }
> = {
  resume: {
    title: 'Currículo',
    formats: 'PDF ou DOCX, até 10 MB',
    accept: `.pdf,.docx,${PDF_MIME},${DOCX_MIME}`,
    hint: 'A versão mais atual que você tiver.',
  },
  linkedin_pdf: {
    title: 'PDF do LinkedIn',
    formats: 'PDF, até 10 MB',
    accept: `.pdf,${PDF_MIME}`,
    hint: 'No seu perfil do LinkedIn, abra “Mais” e escolha “Salvar como PDF”.',
  },
};

const FAILURE_MESSAGES: Record<string, string> = {
  no_text:
    'Não encontramos texto neste arquivo. Se for um PDF escaneado, envie uma versão com texto selecionável.',
  too_long: 'O documento é longo demais para analisar. Envie uma versão mais curta.',
  unreadable: 'Não conseguimos ler este arquivo. Exporte de novo e envie outra vez.',
  processing_error: 'A análise não terminou por um problema nosso. Tente de novo.',
};

export const failureMessage = (code: string | null) =>
  FAILURE_MESSAGES[code ?? ''] ?? FAILURE_MESSAGES.processing_error!;

/** Só oferece nova análise quando ela pode dar certo: repetir um arquivo sem texto não adianta. */
export const canAnalyze = (document: Pick<DocumentRecord, 'status' | 'failureCode'>) =>
  document.status === 'uploaded' ||
  (document.status === 'failed' &&
    (document.failureCode === null || document.failureCode === 'processing_error'));

/** Alguns sistemas não informam o tipo do arquivo: nesse caso, vale a extensão. */
export function mimeTypeOf(file: Pick<File, 'name' | 'type'>): string {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return PDF_MIME;
  if (name.endsWith('.docx')) return DOCX_MIME;
  return '';
}

/** Conferência rápida para avisar antes de enviar. A API e o conteúdo do arquivo têm a palavra final. */
export function validateFile(
  kind: DocumentKind,
  file: Pick<File, 'name' | 'type' | 'size'>,
): string | null {
  const mime = mimeTypeOf(file);
  const allowed = kind === 'resume' ? [PDF_MIME, DOCX_MIME] : [PDF_MIME];
  if (!allowed.includes(mime)) {
    return kind === 'resume'
      ? 'Envie um arquivo PDF ou DOCX.'
      : 'O arquivo do LinkedIn deve ser um PDF.';
  }
  if (file.size === 0) return 'Este arquivo está vazio.';
  if (file.size > MAX_FILE_BYTES) return 'O arquivo deve ter no máximo 10 MB.';
  return null;
}

export function formatBytes(bytes: number): string {
  const format = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1 ? `${format(megabytes)} MB` : `${format(Math.max(bytes / 1024, 1))} KB`;
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

const STORAGE_ERROR = 'Não foi possível enviar o arquivo. Verifique a conexão e tente de novo.';

/** Usa XHR porque o fetch não informa o progresso do envio. O cookie de sessão não vai ao storage. */
function putFile(
  upload: RequestUpload['upload'],
  file: File,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(upload.method, upload.url);
    for (const [name, value] of Object.entries(upload.headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new ApiError(STORAGE_ERROR, request.status, 'STORAGE_FAILED'));
    request.onerror = () => reject(new ApiError(STORAGE_ERROR, 0, 'STORAGE_FAILED'));
    request.onabort = () => reject(new DOMException('Envio cancelado.', 'AbortError'));
    signal.addEventListener('abort', () => request.abort(), { once: true });
    request.send(file);
  });
}

/**
 * Pede a URL assinada, envia o arquivo direto ao storage e confirma o envio na API, que confere o
 * conteúdo real. Se o envio falhar ou for cancelado, o registro incompleto não fica para trás.
 */
export async function uploadDocument(
  kind: DocumentKind,
  file: File,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<DocumentRecord> {
  const { document, upload } = await api<RequestUpload>('/v1/documents', {
    method: 'POST',
    body: { kind, mimeType: mimeTypeOf(file), sizeBytes: file.size },
  });
  try {
    await putFile(upload, file, onProgress, signal);
  } catch (cause) {
    await api(`/v1/documents/${document.id}`, { method: 'DELETE' }).catch(() => undefined);
    throw cause;
  }
  return api<DocumentRecord>(`/v1/documents/${document.id}/complete`, { method: 'POST' });
}
