import { z } from 'zod';
import { JOBS_STRUCTURE_QUEUE, type StructureOutcome } from '@linkediner/core/jobs';
import { defineTask } from '../task';

/** Organiza em campos o texto de uma vaga importada (M-09). O payload leva só IDs. */
export const jobsStructure = (deps: {
  structure: {
    run(
      payload: { userId: string; jobId: string },
      opts: { isLastAttempt: boolean },
    ): Promise<StructureOutcome>;
  };
}) =>
  defineTask({
    name: JOBS_STRUCTURE_QUEUE.name,
    payload: z.object({ userId: z.uuid(), jobId: z.uuid() }).strict(),
    retryLimit: JOBS_STRUCTURE_QUEUE.retryLimit,
    expireInSeconds: JOBS_STRUCTURE_QUEUE.expireInSeconds,
    async handle(payload, ctx) {
      const outcome = await deps.structure.run(payload, { isLastAttempt: ctx.isLastAttempt });
      ctx.logger.info({ jobId: payload.jobId, outcome }, 'estruturação de vaga concluída');
    },
  });
