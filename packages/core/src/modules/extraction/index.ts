// Entrada usada pela API: sem bibliotecas de leitura de PDF nem SDK de IA.
export {
  DOCUMENTS_EXTRACT_QUEUE,
  FAILURE_CODES,
  type ExtractJobPayload,
} from './domain/extraction-rules';
export type { ExtractionQueue, TextExtractor } from './application/ports';
export { ExtractionRequests } from './application/extraction-requests';
export { REDACTED_MARK, redactSensitiveData } from './domain/redact';
