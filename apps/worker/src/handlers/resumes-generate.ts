import { z } from 'zod';
import { RESUMES_GENERATE_QUEUE, type GenerateOutcome } from '@linkediner/core/resumes';
import { defineTask } from '../task';

/** Gera a redação do currículo melhorado (M-07). O payload leva só IDs. */
export const resumesGenerate = (deps: {
  generate: {
    run(
      job: { userId: string; resumeId: string },
      opts: { isLastAttempt: boolean },
    ): Promise<GenerateOutcome>;
  };
}) =>
  defineTask({
    name: RESUMES_GENERATE_QUEUE.name,
    payload: z.object({ userId: z.uuid(), resumeId: z.uuid() }).strict(),
    retryLimit: RESUMES_GENERATE_QUEUE.retryLimit,
    expireInSeconds: RESUMES_GENERATE_QUEUE.expireInSeconds,
    async handle(payload, ctx) {
      const outcome = await deps.generate.run(payload, { isLastAttempt: ctx.isLastAttempt });
      ctx.logger.info({ resumeId: payload.resumeId, outcome }, 'geração de currículo concluída');
    },
  });
