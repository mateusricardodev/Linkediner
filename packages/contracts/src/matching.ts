import { z } from 'zod';

export const JobMatchResponse = z
  .object({
    jobId: z.uuid(),
    careerGoalId: z.uuid().nullable(),
    /** Nulo quando a vaga não traz requisitos: não há o que comparar. */
    score: z.number().int().min(0).max(100).nullable(),
    rubricVersion: z.string(),
    calculatedAt: z.iso.datetime(),
    factors: z.array(
      z.object({
        criterion: z.enum(['must_have', 'nice_to_have', 'seniority', 'work_model']),
        kind: z.enum(['positive', 'gap']),
        points: z.number().int(),
        maxPoints: z.number().int(),
        label: z.string(),
      }),
    ),
    requirements: z.array(
      z.object({
        text: z.string(),
        kind: z.enum(['must_have', 'nice_to_have']),
        /** missing: não encontrado no perfil, o que não significa que a pessoa não tenha. */
        status: z.enum(['met', 'partial', 'missing', 'unverified']),
        factIds: z.array(z.string()),
      }),
    ),
    recommendations: z.array(z.string()),
    /** Sempre exibido junto do score: ele não indica chance de contratação. */
    disclaimer: z.string(),
  })
  .meta({ id: 'JobMatchResponse' });

export const JobMatchQuery = z
  .object({ goalId: z.uuid().optional() })
  .meta({ id: 'JobMatchQuery' });
