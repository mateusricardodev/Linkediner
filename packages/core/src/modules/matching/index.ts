export {
  MATCH_DISCLAIMER,
  MATCH_RUBRIC_VERSION,
  MATCH_V1_WEIGHTS,
  computeCompatibility,
  type MatchCriterion,
  type MatchFactor,
  type MatchInput,
  type MatchResult,
  type RequirementMatch,
  type RequirementStatus,
} from './domain/compatibility';
export {
  MatchingService,
  type JobMatchRecord,
  type MatchRepository,
} from './application/matching-service';
export { DrizzleMatchRepository } from './infrastructure/drizzle-match-repository';
