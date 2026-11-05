import { z } from 'zod';

export const ResumeStatus = z
  .enum(['generating', 'draft', 'approved', 'failed'])
  .meta({ id: 'ResumeStatus' });

export const ResumeItemDto = z
  .object({
    id: z.string(),
    text: z.string(),
    factIds: z.array(z.string()),
    /** suggested: precisa da confirmação do usuário. */
    status: z.enum(['grounded', 'suggested', 'user_confirmed', 'removed']),
    reason: z.enum(['no_source', 'unsupported_value']).nullable(),
  })
  .meta({ id: 'ResumeItem' });

const factData = z.record(z.string(), z.string().nullable());

export const ResumeContentDto = z
  .object({
    summary: z.array(ResumeItemDto),
    experiences: z.array(
      z.object({
        factId: z.string(),
        company: z.string().nullable(),
        title: z.string().nullable(),
        startDate: z.string().nullable(),
        endDate: z.string().nullable(),
        location: z.string().nullable(),
        bullets: z.array(ResumeItemDto),
      }),
    ),
    skills: z.array(z.string()),
    education: z.array(factData),
    certifications: z.array(factData),
    projects: z.array(factData),
    languages: z.array(factData),
  })
  .meta({ id: 'ResumeContent' });

export const ResumeDto = z
  .object({
    id: z.uuid(),
    status: ResumeStatus,
    content: ResumeContentDto.nullable(),
    /** Motivo da falha: no_facts, consent_revoked ou processing_error. */
    failureCode: z.string().nullable(),
    approvedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Resume' });

export const DecideResumeItemBody = z
  .discriminatedUnion('action', [
    z
      .object({ action: z.literal('confirm'), text: z.string().trim().min(1).max(600).optional() })
      .strict(),
    z.object({ action: z.literal('remove') }).strict(),
  ])
  .meta({ id: 'DecideResumeItemBody' });

export const ExportResumeQuery = z
  .object({ format: z.enum(['pdf', 'docx']) })
  .meta({ id: 'ExportResumeQuery' });
