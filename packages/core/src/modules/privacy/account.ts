/** Exclusão e exportação da conta. Fica fora do index.ts porque depende do módulo de documentos. */
export {
  EXPORT_USER_QUEUE,
  PURGE_USER_QUEUE,
  assertRecentLogin,
  type DataExport,
  type DeletionRequest,
  type ExportUserJob,
  type PurgeUserJob,
} from './domain/account-data';
export {
  AccountDeletionService,
  PurgeUser,
  type AccountDeletionRepository,
  type PendingTasks,
  type PurgeOutcome,
  type PurgeQueue,
  type PurgeUserDeps,
} from './application/account-deletion';
export {
  DataExportService,
  ExpireExports,
  ExportUserData,
  type AccountDataReader,
  type AccountDataSnapshot,
  type BuildExportZip,
  type DataExportRepository,
  type ExportOutcome,
  type ExportQueue,
  type ExportUserDataDeps,
} from './application/data-export';
export { DrizzleAccountDeletionRepository } from './infrastructure/drizzle-account-deletion-repository';
export { DrizzleDataExportRepository } from './infrastructure/drizzle-data-export-repository';
export {
  DrizzleAccountDataReader,
  EXPORTED_TABLES,
  NOT_EXPORTED_TABLES,
  PARTIALLY_EXPORTED_TABLES,
} from './infrastructure/drizzle-account-data-reader';
