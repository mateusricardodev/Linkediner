/** Fila da extração. O payload leva só IDs, nunca dados pessoais. */
export const DOCUMENTS_EXTRACT_QUEUE = {
  name: 'documents.extract',
  deadLetter: 'documents.extract.dead',
  /**
   * O provedor de IA fica sobrecarregado por até dezenas de minutos: as tentativas se espaçam
   * (20 s, 40 s, 80 s... até cerca de 10 min), somando uns 20 minutos antes de desistir.
   */
  retryLimit: 6,
  retryDelay: 20,
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
