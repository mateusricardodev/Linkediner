export {
  CONSENT_PURPOSES,
  CURRENT_CONSENT_VERSIONS,
  REQUIRED_PURPOSES,
  computeConsentStatus,
  type ConsentPurpose,
  type ConsentRecord,
  type ConsentStatus,
} from './domain/consent';
export type { ConsentRepository } from './application/ports/consent-repository';
export { ConsentService } from './application/consent-service';
export { DrizzleConsentRepository } from './infrastructure/drizzle-consent-repository';
