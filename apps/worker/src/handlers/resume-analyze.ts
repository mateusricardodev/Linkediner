import { z } from 'zod';
import { RESUME_ANALYZE_QUEUE, type AnalyzeOutcome } from '@linkediner/core/resume-analysis';
import { defineTask } from '../task';

/** Analisa o currículo enviado (ADR 0035). O payload leva só IDs. */
export const resumeAnalyze = (deps: {
  analyze: {
    run(
      job: { userId: string; analysisId: string },
      opts: { isLastAttempt: boolean },
    ): Promise<AnalyzeOutcome>;
  };
}) =>
  defineTask({
    name: RESUME_ANALYZE_QUEUE.name,
    payload: z.object({ userId: z.uuid(), analysisId: z.uuid() }).strict(),
    retryLimit: RESUME_ANALYZE_QUEUE.retryLimit,
    retryDelay: RESUME_ANALYZE_QUEUE.retryDelay,
    expireInSeconds: RESUME_ANALYZE_QUEUE.expireInSeconds,
    async handle(payload, ctx) {
      const outcome = await deps.analyze.run(payload, { isLastAttempt: ctx.isLastAttempt });
      ctx.logger.info(
        { analysisId: payload.analysisId, outcome },
        'análise de currículo concluída',
      );
    },
  });
