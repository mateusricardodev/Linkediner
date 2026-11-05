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
export type { ProfileRepository } from './application/ports/profile-repository';
export { ProfileService, type ProfileView } from './application/profile-service';
export { DrizzleProfileRepository } from './infrastructure/drizzle-profile-repository';
