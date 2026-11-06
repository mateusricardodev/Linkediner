import { z } from 'zod';
import {
  EXPORT_USER_QUEUE,
  PURGE_USER_QUEUE,
  type ExportOutcome,
  type ExportUserJob,
  type PurgeOutcome,
  type PurgeUserJob,
} from '@linkediner/core/privacy/account';
import { defineTask } from '../task';

/** Expurgo da conta (ADR 0019). O payload leva só o ID do pedido. */
export const privacyPurgeUser = (deps: {
  purge: { run(job: PurgeUserJob, opts: { isLastAttempt: boolean }): Promise<PurgeOutcome> };
}) =>
  defineTask({
    name: PURGE_USER_QUEUE.name,
    payload: z.object({ requestId: z.uuid() }).strict(),
    retryLimit: PURGE_USER_QUEUE.retryLimit,
    expireInSeconds: PURGE_USER_QUEUE.expireInSeconds,
    async handle(payload, ctx) {
      const outcome = await deps.purge.run(payload, { isLastAttempt: ctx.isLastAttempt });
      ctx.logger.info({ requestId: payload.requestId, outcome }, 'expurgo de conta concluído');
    },
  });

/** Retoma exclusões paradas: um pedido não pode se perder junto com uma tarefa da fila. */
export const privacyResumePurges = (deps: {
  purge: { resumeOpen(): Promise<{ resumed: number; failed: number }> };
}) =>
  defineTask({
    name: 'privacy.resume_purges',
    payload: z.object({}).strict(),
    retryLimit: 0,
    expireInSeconds: 10 * 60,
    cron: '*/15 * * * *',
    async handle(_payload, ctx) {
      const result = await deps.purge.resumeOpen();
      if (result.failed > 0) ctx.logger.error(result, 'exclusões de conta continuam falhando');
      else if (result.resumed > 0) ctx.logger.warn(result, 'exclusões de conta retomadas');
    },
  });

/** Exportação dos dados da pessoa (F9). O payload leva só IDs. */
export const privacyExportUser = (deps: {
  exporter: { run(job: ExportUserJob, opts: { isLastAttempt: boolean }): Promise<ExportOutcome> };
}) =>
  defineTask({
    name: EXPORT_USER_QUEUE.name,
    payload: z.object({ userId: z.uuid(), exportId: z.uuid() }).strict(),
    retryLimit: EXPORT_USER_QUEUE.retryLimit,
    expireInSeconds: EXPORT_USER_QUEUE.expireInSeconds,
    async handle(payload, ctx) {
      const outcome = await deps.exporter.run(payload, { isLastAttempt: ctx.isLastAttempt });
      ctx.logger.info({ exportId: payload.exportId, outcome }, 'exportação concluída');
    },
  });

/** Apaga as exportações com mais de 7 dias. */
export const privacyExpireExports = (deps: { expire: { run(): Promise<{ deleted: number }> } }) =>
  defineTask({
    name: 'privacy.expire_exports',
    payload: z.object({}).strict(),
    retryLimit: 3,
    expireInSeconds: 30 * 60,
    cron: '41 3 * * *',
    async handle(_payload, ctx) {
      const { deleted } = await deps.expire.run();
      ctx.logger.info({ deleted }, 'exportações expiradas removidas');
    },
  });
