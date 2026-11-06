/** Fila da extração. O payload leva só IDs, nunca dados pessoais. */
export const DOCUMENTS_EXTRACT_QUEUE = {
  name: 'documents.extract',
  deadLetter: 'documents.extract.dead',
  retryLimit: 2,
  expireInSeconds: 5 * 60,
} as const;

export const usageKeyFor = (usageId: string) => `extract:${usageId}`;

export interface ExtractJobPayload {
  userId: string;
  documentId: string;
  /** Identifica o consumo do plano, para estornar se a análise falhar. */
  usageId: string;
}

export const TEXT_LIMITS = {
  /** Abaixo disso, o PDF provavelmente é uma imagem escaneada. */
  minChars: 30,
  maxChars: 100_000,
} as const;

/** Motivos estáveis de falha, mostrados ao usuário pelo frontend. Não trazem conteúdo do documento. */
export const FAILURE_CODES = {
  noText: 'no_text',
  tooLong: 'too_long',
  unreadable: 'unreadable',
  processingError: 'processing_error',
} as const;
