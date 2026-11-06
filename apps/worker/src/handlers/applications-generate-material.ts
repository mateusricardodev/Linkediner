import { z } from 'zod';
import {
  MATERIALS_GENERATE_QUEUE,
  type GenerateMaterialJob,
  type MaterialOutcome,
} from '@linkediner/core/applications';
import { defineTask } from '../task';

/** Gera o material da candidatura: currículo por vaga, carta ou respostas. O payload leva só IDs. */
export const applicationsGenerateMaterial = (deps: {
  generate: {
    run(job: GenerateMaterialJob, opts: { isLastAttempt: boolean }): Promise<MaterialOutcome>;
  };
}) =>
  defineTask({
    name: MATERIALS_GENERATE_QUEUE.name,
    payload: z.object({ userId: z.uuid(), applicationId: z.uuid(), materialId: z.uuid() }).strict(),
    retryLimit: MATERIALS_GENERATE_QUEUE.retryLimit,
    expireInSeconds: MATERIALS_GENERATE_QUEUE.expireInSeconds,
    async handle(payload, ctx) {
      const outcome = await deps.generate.run(payload, { isLastAttempt: ctx.isLastAttempt });
      ctx.logger.info({ materialId: payload.materialId, outcome }, 'geração de material concluída');
    },
  });
