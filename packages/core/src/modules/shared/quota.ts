/** Funcionalidades com limite por plano. Os limites são dados no banco, nunca código (ADR 0010). */
export const FEATURE_KEYS = [
  'profile.analysis',
  'resume.improved',
  'resume.tailored',
  'cover_letter',
  'form_answers',
  'job.match',
  'applications.assisted',
  'applications.auto',
  'export.watermark',
  'dashboard.full',
  'sources.extra',
  'apply_rules.advanced',
  'monitoring.frequency_hours',
  'github.deep_analysis',
  'interview.simulation',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/**
 * Limite de uso, visto pelos módulos que gastam. Quem consome não sabe qual é o plano.
 * Repetir a mesma chave não consome de novo, e estornar duas vezes devolve uma vez só.
 */
export interface QuotaGate {
  /** Lança QUOTA_EXCEEDED se o limite do período acabou. */
  consume(userId: string, feature: FeatureKey, key: string): Promise<void>;
  /** Devolve o que foi consumido, quando o trabalho falha sem entregar nada. */
  refund(userId: string, feature: FeatureKey, key: string): Promise<void>;
}
