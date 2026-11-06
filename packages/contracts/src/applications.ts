import { z } from 'zod';

export const ApplicationState = z
  .enum([
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
  ])
  .meta({ id: 'ApplicationState' });

export const ApplicationDto = z
  .object({
    id: z.uuid(),
    /** Fica nulo se a vaga for apagada. Os dados dela continuam em `job`. */
    jobId: z.uuid().nullable(),
    job: z.object({
      title: z.string().nullable(),
      company: z.string().nullable(),
      applyUrl: z.string().nullable(),
    }),
    state: ApplicationState,
    resumeId: z.uuid().nullable(),
    submissionMode: z.enum(['api', 'assisted', 'manual']).nullable(),
    submittedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Application' });

export const ApplicationDetail = z
  .object({
    application: ApplicationDto,
    events: z.array(
      z.object({
        from: ApplicationState.nullable(),
        to: ApplicationState,
        actor: z.enum(['user', 'system', 'source']),
        reason: z.string().nullable(),
        createdAt: z.iso.datetime(),
      }),
    ),
    manualTasks: z.array(
      z.object({
        id: z.uuid(),
        reason: z.string(),
        resolvedAt: z.iso.datetime().nullable(),
      }),
    ),
  })
  .meta({ id: 'ApplicationDetail' });

export const CreateApplicationBody = z
  .object({ jobId: z.uuid() })
  .strict()
  .meta({ id: 'CreateApplicationBody' });

export const AttachResumeBody = z
  .object({ resumeId: z.uuid() })
  .strict()
  .meta({ id: 'AttachResumeBody' });

export const ApplicationOutcomeBody = z
  .object({ outcome: z.enum(['interview_received', 'rejected', 'closed']) })
  .strict()
  .meta({ id: 'ApplicationOutcomeBody' });

export const DashboardResponse = z
  .object({
    counts: z.partialRecord(ApplicationState, z.number().int()),
    total: z.number().int(),
    sent: z.number().int(),
    interviews: z.number().int(),
    needsAttention: z.array(ApplicationDto),
  })
  .meta({ id: 'DashboardResponse' });
