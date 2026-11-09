export {
  CURRENCIES,
  LIMITS as PROFILE_LIMITS,
  LINKEDIN_CHECKLIST_ITEMS,
  LINK_KINDS,
  SALARY_PERIODS,
  SENIORITIES,
  normalizeLink,
  validateCareerGoal,
  validateLinks,
  validateProfilePatch,
  type CareerGoal,
  type CareerGoalInput,
  type Currency,
  type LinkKind,
  type LinkedinChecklistItem,
  type Profile,
  type ProfileLink,
  type SalaryPeriod,
  type Seniority,
} from './domain/profile';
export {
  FACT_DATA_SCHEMAS,
  FACT_TYPES,
  FACT_VERIFICATIONS,
  fingerprintFact,
  normalizeText,
  type FactData,
  type FactType,
  type FactVerification,
  type NewFact,
  type ProfileFact,
} from './domain/facts';
export type { FactRepository } from './application/ports/fact-repository';
export { FactService, type FactDecision } from './application/fact-service';
export { DrizzleFactRepository } from './infrastructure/drizzle-fact-repository';
export type { ProfileRepository } from './application/ports/profile-repository';
export { ProfileService, type ProfileView } from './application/profile-service';
export {
  RUBRIC_V1_WEIGHTS,
  RUBRIC_VERSION,
  SCORE_DISCLAIMER,
  computeProfileScore,
  type CriterionId,
  type ScoreFactor,
  type ScoreInput,
  type ScoreResult,
} from './domain/score';
export type { ScoreRepository, StoredScore } from './application/ports/score-repository';
export { ProfileScoreService, type ProfileScoreView } from './application/score-service';
export { DrizzleScoreRepository } from './infrastructure/drizzle-score-repository';
export { DrizzleProfileRepository } from './infrastructure/drizzle-profile-repository';
