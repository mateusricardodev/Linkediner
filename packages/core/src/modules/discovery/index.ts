export {
  buildRawText,
  contentHash,
  htmlToText,
  isRelevantPosting,
  matchesGoal,
  type ExternalPosting,
} from './domain/discovery';
export type {
  Board,
  CatalogPosting,
  CatalogReader,
  CatalogRepository,
  JobSourceAdapter,
} from './application/ports';
export { StructureCatalog, SyncCatalog } from './application/sync-catalog';
export {
  DiscoveryService,
  type DiscoveryAccess,
  type DiscoveryFeed,
  type DiscoveryItem,
} from './application/discovery-service';
export { DrizzleCatalogReader, DrizzleCatalogRepository } from './infrastructure/drizzle-catalog';
export {
  AshbyAdapter,
  GitHubIssuesAdapter,
  GreenhouseAdapter,
  LeverAdapter,
  SmartRecruitersAdapter,
} from './infrastructure/source-adapters';
