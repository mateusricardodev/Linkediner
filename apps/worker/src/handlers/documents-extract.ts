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
}) =>
  defineTask({
    name: DOCUMENTS_EXTRACT_QUEUE.name,
    payload: z.object({ userId: z.uuid(), documentId: z.uuid() }).strict(),
    retryLimit: DOCUMENTS_EXTRACT_QUEUE.retryLimit,
    expireInSeconds: DOCUMENTS_EXTRACT_QUEUE.expireInSeconds,
    async handle(payload, ctx) {
      const outcome = await deps.extract.run(payload, { isLastAttempt: ctx.isLastAttempt });
      ctx.logger.info({ documentId: payload.documentId, outcome }, 'extração concluída');
    },
  });
