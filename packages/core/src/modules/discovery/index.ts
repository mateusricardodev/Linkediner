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
  dedupeByTitleCompany,
  type DiscoveryAccess,
  type DiscoveryCollect,
  type DiscoveryFeed,
  type DiscoveryItem,
} from './application/discovery-service';
export {
  DailySelectionService,
  dayKey,
  selectPicks,
  type DailyPick,
  type DailyPicksRepository,
  type DailySelection,
  type DailySnapshot,
} from './application/daily-selection';
export { DrizzleCatalogReader, DrizzleCatalogRepository } from './infrastructure/drizzle-catalog';
export { DrizzleDailyPicksRepository } from './infrastructure/drizzle-daily-picks-repository';
export {
  AshbyAdapter,
  GitHubIssuesAdapter,
  GreenhouseAdapter,
  HimalayasAdapter,
  JobicyAdapter,
  LeverAdapter,
  SmartRecruitersAdapter,
} from './infrastructure/source-adapters';
