import { z } from 'zod';
import { defineTask } from '../task';

/**
 * Tarefa de exemplo da fundação: confirma periodicamente que o worker consegue
 * consumir a fila e falar com o banco. Serve de modelo para as tarefas dos módulos.
 */
export const systemHeartbeat = (deps: { ping: () => Promise<void> }) =>
  defineTask({
    name: 'system.heartbeat',
    payload: z.object({}).strict(),
    retryLimit: 1,
    expireInSeconds: 30,
    cron: '*/5 * * * *',
    async handle(_payload, ctx) {
      await deps.ping();
      ctx.logger.info({ jobId: ctx.jobId }, 'heartbeat ok');
    },
  });
