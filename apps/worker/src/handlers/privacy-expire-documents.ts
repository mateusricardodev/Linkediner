import { z } from 'zod';
import { defineTask } from '../task';

/**
 * Retenção de documentos (ADR 0008): todo dia, apaga arquivos e registros com mais de 30 dias
 * e uploads iniciados e nunca concluídos.
 */
export const privacyExpireDocuments = (deps: { expire: { run(): Promise<{ deleted: number }> } }) =>
  defineTask({
    name: 'privacy.expire_documents',
    payload: z.object({}).strict(),
    retryLimit: 3,
    expireInSeconds: 30 * 60,
    cron: '17 3 * * *',
    async handle(_payload, ctx) {
      const { deleted } = await deps.expire.run();
      ctx.logger.info({ deleted }, 'documentos expirados removidos');
    },
  });
