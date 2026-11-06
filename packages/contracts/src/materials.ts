import { z } from 'zod';
import { ResumeContentDto, ResumeItemDto } from './resumes';

export const MaterialKind = z
  .enum(['resume', 'cover_letter', 'form_answers'])
  .meta({ id: 'MaterialKind' });

export const MaterialContentDto = z.union([
  ResumeContentDto,
  z.object({ paragraphs: z.array(ResumeItemDto) }),
  z.object({
    answers: z.array(
      z.object({
        question: z.string(),
        /** Nulo: os fatos não respondem, e a pessoa precisa responder por conta própria. */
        answer: ResumeItemDto.nullable(),
      }),
    ),
  }),
]);

export const ApplicationMaterialDto = z
  .object({
    id: z.uuid(),
    applicationId: z.uuid(),
    kind: MaterialKind,
    status: z.enum(['generating', 'ready', 'failed']),
    questions: z.array(z.string()),
    content: MaterialContentDto.nullable(),
    /** Motivo da falha: no_facts, job_deleted, consent_revoked ou processing_error. */
    failureCode: z.string().nullable(),
  })
  .meta({ id: 'ApplicationMaterial' });

export const DecideMaterialItemBody = z
  .discriminatedUnion('action', [
    z
      .object({
        action: z.literal('confirm'),
        // Um parágrafo de carta é maior que um tópico de currículo.
        text: z.string().trim().min(1).max(2000).optional(),
      })
      .strict(),
    z.object({ action: z.literal('remove') }).strict(),
  ])
  .meta({ id: 'DecideMaterialItemBody' });

export const RequestMaterialBody = z
  .object({ kind: MaterialKind, questions: z.array(z.string().max(2000)).max(50).optional() })
  .strict()
  .meta({ id: 'RequestMaterialBody' });
