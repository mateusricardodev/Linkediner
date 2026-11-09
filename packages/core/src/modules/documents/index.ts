export {
  DOCUMENT_KINDS,
  DOCUMENT_RULES,
  DOCX_MIME,
  PDF_MIME,
  inspectFileContent,
  userPrefix,
  type DocumentKind,
  type DocumentRecord,
  type DocumentStatus,
} from './domain/document';
export type { ObjectStorage } from './application/ports/object-storage';
export type {
  DocumentDerivedData,
  DocumentRepository,
  DocumentRetentionRepository,
} from './application/ports/document-repository';
export { DocumentService, type FileSignalsPort } from './application/document-service';
export {
  FILE_CHECK_VERSION,
  evaluateFileCheck,
  textSignals,
  type FileCheck,
  type FileCheckId,
  type FileCheckReport,
  type FileSignals,
} from './domain/file-check';
export { FileSignalsReader, sideBySideRatio } from './infrastructure/file-signals';
export { ExpireDocuments } from './application/expire-documents';
export { S3ObjectStorage, type S3StorageConfig } from './infrastructure/s3-object-storage';
export {
  DrizzleDocumentRepository,
  DrizzleDocumentRetentionRepository,
} from './infrastructure/drizzle-document-repository';
