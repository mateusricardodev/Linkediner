// Entrada usada pelo worker: inclui a leitura de arquivos e a chamada à IA.
export {
  EMPTY_EXTRACTION,
  ExtractionOutput,
  groundFacts,
  type GroundingReport,
} from './domain/grounding';
export { REDACTED_MARK, redactSensitiveData } from './domain/redact';
export {
  ExtractDocument,
  type ExtractDocumentDeps,
  type ExtractOutcome,
} from './application/extract-document';
export { FileTextExtractor } from './infrastructure/file-text-extractor';
