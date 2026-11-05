import { z } from 'zod';
import { DOCUMENTS_EXTRACT_QUEUE } from '@linkediner/core/extraction';
import type { ExtractOutcome } from '@linkediner/core/extraction/worker';
import { defineTask } from '../task';

/** Extrai os fatos de um documento enviado (M-05). O payload leva só IDs. */
export const documentsExtract = (deps: {
  extract: {
    run(
      job: { userId: string; documentId: string },
      opts: { isLastAttempt: boolean },
    ): Promise<ExtractOutcome>;
  };
  scores: { recalculate(userId: string): Promise<unknown> };
}) =>
  defineTask({
    name: DOCUMENTS_EXTRACT_QUEUE.name,
    payload: z.object({ userId: z.uuid(), documentId: z.uuid() }).strict(),
    retryLimit: DOCUMENTS_EXTRACT_QUEUE.retryLimit,
    expireInSeconds: DOCUMENTS_EXTRACT_QUEUE.expireInSeconds,
    async handle(payload, ctx) {
      const outcome = await deps.extract.run(payload, { isLastAttempt: ctx.isLastAttempt });
      ctx.logger.info({ documentId: payload.documentId, outcome }, 'extração concluída');
      if (outcome !== 'processed') return;
      // A extração já terminou: uma falha aqui não pode refazê-la. A leitura do score recalcula depois.
      try {
        await deps.scores.recalculate(payload.userId);
      } catch (err) {
        ctx.logger.warn({ err, documentId: payload.documentId }, 'falha ao recalcular o score');
      }
    },
  });
