import { z } from 'zod';
import { defineTask } from '../task';

/** Atualiza o catálogo a partir das fontes ligadas. Sem fonte ligada, não faz nenhuma chamada. */
export const sourcesSync = (deps: { sync: { run(): Promise<Record<string, number>> } }) =>
  defineTask({
    name: 'sources.sync',
    payload: z.object({}).strict(),
    retryLimit: 1,
    expireInSeconds: 30 * 60,
    cron: '23 */6 * * *',
    async handle(_payload, ctx) {
      ctx.logger.info(await deps.sync.run(), 'catálogo de vagas atualizado');
    },
  });

/** Frequente para um objetivo novo ter resultado logo, sem gastar além do teto de cada rodada. */
export const sourcesStructure = (deps: {
  structure: { run(): Promise<Record<string, number | boolean>> };
}) =>
  defineTask({
    name: 'sources.structure',
    payload: z.object({}).strict(),
    retryLimit: 0,
    expireInSeconds: 25 * 60,
    cron: '*/30 * * * *',
    async handle(_payload, ctx) {
      ctx.logger.info(await deps.structure.run(), 'vagas do catálogo analisadas');
    },
  });
