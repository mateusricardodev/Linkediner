export {
  CURRENCIES,
  LIMITS as PROFILE_LIMITS,
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
export { DrizzleProfileRepository } from './infrastructure/drizzle-profile-repository';
