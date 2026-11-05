import { z } from 'zod';
import { JobDto } from './jobs';

export const FeedbackReason = z
  .enum([
    'liked',
    'disliked',
    'too_senior',
    'misaligned',
    'salary_mismatch',
    'location_mismatch',
    'tech_mismatch',
    'company_blocked',
    'already_applied',
    'more_like_this',
  ])
  .meta({ id: 'FeedbackReason' });

/** A lista substitui a avaliação anterior. Lista vazia limpa. */
export const JobFeedbackBody = z
  .object({ reasons: z.array(FeedbackReason).max(10) })
  .strict()
  .meta({ id: 'JobFeedbackBody' });

export const JobFeedbackResponse = z
  .object({ reasons: z.array(FeedbackReason) })
  .meta({ id: 'JobFeedbackResponse' });

export const RecommendationsResponse = z
  .object({
    items: z.array(
      z.object({
        job: JobDto,
        /** Compatibilidade com a vaga. As avaliações nunca alteram este número. */
        score: z.number().int().nullable(),
        /** Usado só para ordenar a lista. */
        rankScore: z.number().int().nullable(),
        /** Por que a posição mudou, a partir das suas avaliações. */
        explanation: z.array(z.string()),
        feedback: z.array(FeedbackReason),
      }),
    ),
    /** Quantas vagas ficaram de fora por causa das suas avaliações. */
    hidden: z.number().int(),
    disclaimer: z.string(),
  })
  .meta({ id: 'RecommendationsResponse' });
