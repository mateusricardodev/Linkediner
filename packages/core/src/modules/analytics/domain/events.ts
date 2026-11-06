import type { AuditEntry } from '../../audit';

export const EVENT_RETENTION_DAYS = 395;

export type EventName =
  | 'user_signed_up'
  | 'resume_uploaded'
  | 'resume_generated'
  | 'material_generated'
  | 'material_approved'
  | 'job_imported'
  | 'job_recommended'
  | 'job_viewed'
  | 'job_feedback_given'
  | 'application_created'
  | 'application_approved'
  | 'application_rejected_by_user'
  | 'application_sent'
  | 'manual_task_completed'
  | 'interview_reported'
  | 'application_outcome_reported';

export interface ProductEvent {
  name: EventName;
  properties?: Record<string, unknown>;
  /** Com chave, o evento conta uma vez só por usuário. */
  dedupeKey?: string;
}

const FROM_AUDIT: Record<string, EventName[]> = {
  'user.signed_up': ['user_signed_up'],
  'document.uploaded': ['resume_uploaded'],
  'resume.generated': ['resume_generated'],
  'resume.approved': ['material_approved'],
  'material.generated': ['material_generated'],
  'job.imported': ['job_imported'],
  'job.feedback': ['job_feedback_given'],
  'application.created': ['application_created'],
  'application.approved': ['application_approved'],
  'application.closed': ['application_rejected_by_user'],
  // Sem fonte autorizada, todo envio hoje é manual: ele também conclui a pendência.
  'application.sent': ['application_sent', 'manual_task_completed'],
  'application.outcome': ['application_outcome_reported'],
};

/**
 * Só estes valores saem da auditoria para as métricas. Todos são códigos fechados. Campo novo na
 * auditoria não vira propriedade de evento sem passar por aqui.
 */
const ALLOWED_PROPERTIES = ['kind', 'source', 'reasons', 'outcome'] as const;

/** Traduz uma ação da auditoria nos eventos de produto. A maioria das ações não vira evento. */
export function eventsFromAudit(entry: AuditEntry): ProductEvent[] {
  const names = FROM_AUDIT[entry.action];
  if (!names) return [];
  const properties: Record<string, unknown> = {};
  for (const key of ALLOWED_PROPERTIES) {
    if (entry.metadata?.[key] !== undefined) properties[key] = entry.metadata[key];
  }
  const events: ProductEvent[] = names.map((name) => ({ name, properties }));
  if (entry.action === 'application.outcome' && properties.outcome === 'interview_received') {
    events.push({ name: 'interview_reported', properties: {} });
  }
  return events;
}
