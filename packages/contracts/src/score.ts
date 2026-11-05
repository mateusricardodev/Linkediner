import { z } from 'zod';

export const ScoreCriterion = z
  .enum([
    'experience',
    'experience_dates',
    'experience_descriptions',
    'measurable_results',
    'skills',
    'education',
    'projects',
    'languages',
    'links',
    'summary',
    'goal',
  ])
  .meta({ id: 'ScoreCriterion' });

export const ScoreFactorDto = z
  .object({
    criterion: ScoreCriterion,
    kind: z.enum(['positive', 'gap']),
    points: z.number().int(),
    maxPoints: z.number().int(),
    label: z.string(),
    recommendation: z.string().nullable(),
    factIds: z.array(z.string()),
  })
  .meta({ id: 'ScoreFactor' });

export const ProfileScoreResponse = z
  .object({
    score: z.number().int().min(0).max(100),
    rubricVersion: z.string(),
    calculatedAt: z.iso.datetime(),
    factors: z.array(ScoreFactorDto),
    history: z.array(z.object({ score: z.number().int(), calculatedAt: z.iso.datetime() })),
    /** Sempre exibido junto do score: ele não indica chance de contratação. */
    disclaimer: z.string(),
  })
  .meta({ id: 'ProfileScoreResponse' });
