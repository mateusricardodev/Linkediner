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
  DocumentRepository,
  DocumentRetentionRepository,
} from './application/ports/document-repository';
export { DocumentService } from './application/document-service';
export { ExpireDocuments } from './application/expire-documents';
export { S3ObjectStorage, type S3StorageConfig } from './infrastructure/s3-object-storage';
export {
  DrizzleDocumentRepository,
  DrizzleDocumentRetentionRepository,
} from './infrastructure/drizzle-document-repository';
