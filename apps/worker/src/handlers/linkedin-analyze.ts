import { z } from 'zod';
import { LINKEDIN_ANALYZE_QUEUE, type AnalyzeOutcome } from '@linkediner/core/linkedin';
import { defineTask } from '../task';

/** Analisa o perfil do LinkedIn a partir do PDF (ADR 0034). O payload leva só IDs. */
export const linkedinAnalyze = (deps: {
  analyze: {
    run(
      job: { userId: string; analysisId: string },
      opts: { isLastAttempt: boolean },
    ): Promise<AnalyzeOutcome>;
  };
}) =>
  defineTask({
    name: LINKEDIN_ANALYZE_QUEUE.name,
    payload: z.object({ userId: z.uuid(), analysisId: z.uuid() }).strict(),
    retryLimit: LINKEDIN_ANALYZE_QUEUE.retryLimit,
    retryDelay: LINKEDIN_ANALYZE_QUEUE.retryDelay,
    expireInSeconds: LINKEDIN_ANALYZE_QUEUE.expireInSeconds,
    async handle(payload, ctx) {
      const outcome = await deps.analyze.run(payload, { isLastAttempt: ctx.isLastAttempt });
      ctx.logger.info({ analysisId: payload.analysisId, outcome }, 'análise do LinkedIn concluída');
    },
  });
