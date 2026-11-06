import type { ResumeContent } from '../../resumes';
import { AppError } from '../../shared';

export const APPLICATION_STATES = [
  'recommended',
  'saved',
  'analyzing',
  'in_review',
  'awaiting_approval',
  'approved',
  'sending',
  'sent',
  'failed',
  'blocked_by_source',
  'manual_action_required',
  'interview_received',
  'rejected',
  'closed',
] as const;
export type ApplicationState = (typeof APPLICATION_STATES)[number];
export type ApplicationActor = 'user' | 'system' | 'source';
export type SubmissionMode = 'api' | 'assisted' | 'manual';

/** Máquina de estados (docs/arquitetura/04-fluxos.md): quem pode levar de um estado a outro. */
export const TRANSITIONS: Record<
  ApplicationState,
  Partial<Record<ApplicationState, readonly ApplicationActor[]>>
> = {
  recommended: { saved: ['user'], analyzing: ['user', 'system'], closed: ['user'] },
  saved: { analyzing: ['user', 'system'], closed: ['user'] },
  analyzing: { in_review: ['system'], closed: ['user'] },
  in_review: { awaiting_approval: ['user'], closed: ['user'] },
  awaiting_approval: { in_review: ['user'], approved: ['user'], closed: ['user'] },
  approved: { sending: ['system'], manual_action_required: ['system'] },
  sending: { sent: ['source', 'system'], failed: ['system'], blocked_by_source: ['source'] },
  failed: { sending: ['system'], manual_action_required: ['system'] },
  blocked_by_source: { manual_action_required: ['system'] },
  manual_action_required: { sent: ['user'], closed: ['user'] },
  sent: { interview_received: ['user', 'source'], rejected: ['user', 'source'], closed: ['user'] },
  interview_received: { rejected: ['user', 'source'], closed: ['user'] },
  rejected: { closed: ['user'] },
  closed: {},
};

export function canTransition(
  from: ApplicationState,
  to: ApplicationState,
  actor: ApplicationActor,
): boolean {
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

export function assertTransition(
  from: ApplicationState,
  to: ApplicationState,
  actor: ApplicationActor,
): void {
  if (!canTransition(from, to, actor)) {
    throw new AppError('INVALID_STATE_TRANSITION', 'Esta ação não é possível no estado atual.', {
      from,
      to,
    });
  }
}

export interface JobSummary {
  title: string | null;
  company: string | null;
  applyUrl: string | null;
}

export interface Application {
  id: string;
  jobId: string | null;
  job: JobSummary;
  state: ApplicationState;
  resumeId: string | null;
  submissionMode: SubmissionMode | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationEvent {
  from: ApplicationState | null;
  to: ApplicationState;
  actor: ApplicationActor;
  reason: string | null;
  createdAt: Date;
}

export interface ManualTask {
  id: string;
  reason: string;
  resolvedAt: Date | null;
}

/** O que muda junto com a transição, na mesma transação. */
export interface TransitionChange {
  resumeId?: string;
  materialSnapshot?: ResumeContent | null;
  submissionMode?: SubmissionMode;
  submittedAt?: Date;
  createManualTask?: { reason: string };
  resolveManualTasks?: { at: Date };
}

export interface TransitionStep {
  to: ApplicationState;
  actor: ApplicationActor;
  reason?: string;
}

/** Candidaturas que esperam uma ação da pessoa aparecem primeiro no dashboard. */
export const NEEDS_ATTENTION: readonly ApplicationState[] = [
  'manual_action_required',
  'awaiting_approval',
  'in_review',
  'failed',
  'blocked_by_source',
];

export interface Dashboard {
  counts: Partial<Record<ApplicationState, number>>;
  total: number;
  sent: number;
  interviews: number;
  needsAttention: Application[];
}

export function buildDashboard(applications: readonly Application[]): Dashboard {
  const counts: Dashboard['counts'] = {};
  for (const { state } of applications) counts[state] = (counts[state] ?? 0) + 1;
  const attentionOrder = (a: Application) => NEEDS_ATTENTION.indexOf(a.state);
  return {
    counts,
    total: applications.length,
    // A data de envio não muda depois: entrevista, rejeição e encerramento continuam contando.
    sent: applications.filter((a) => a.submittedAt).length,
    interviews: counts.interview_received ?? 0,
    needsAttention: applications
      .filter((a) => NEEDS_ATTENTION.includes(a.state))
      .sort(
        (a, b) =>
          attentionOrder(a) - attentionOrder(b) || b.updatedAt.getTime() - a.updatedAt.getTime(),
      )
      .slice(0, 20),
  };
}
