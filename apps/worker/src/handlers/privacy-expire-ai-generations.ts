import { z } from 'zod';
import { defineTask } from '../task';

export const AI_GENERATION_RETENTION_DAYS = 90;

/** Retenção do registro de gerações de IA (docs/arquitetura/03-dados.md). */
export const privacyExpireAiGenerations = (deps: {
  generations: { deleteOlderThan(cutoff: Date): Promise<number> };
  now?: () => Date;
}) =>
  defineTask({
    name: 'privacy.expire_ai_generations',
    payload: z.object({}).strict(),
    retryLimit: 3,
    expireInSeconds: 10 * 60,
    cron: '41 3 * * *',
    async handle(_payload, ctx) {
      const now = (deps.now ?? (() => new Date()))();
      const cutoff = new Date(now.getTime() - AI_GENERATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const deleted = await deps.generations.deleteOlderThan(cutoff);
      ctx.logger.info({ deleted }, 'registros de IA expirados removidos');
    },
  });
