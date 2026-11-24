import type { PgBoss } from 'pg-boss';
import type { Logger } from '@linkediner/observability';
import { deadLetterQueue, type AnyTask } from './task';

/** Executa um job: valida o payload e chama o handler com logger contextual. */
export async function runTask(
  task: AnyTask,
  job: { id: string; data: unknown; retryCount?: number },
  logger: Logger,
) {
  const log = logger.child({ task: task.name, jobId: job.id });
  const parsed = task.payload.safeParse(job.data);
  if (!parsed.success) {
    // Payload inválido não melhora com nova tentativa: registra e falha.
    log.error({ issues: parsed.error.issues.map((i) => i.path.join('.')) }, 'payload inválido');
    throw new Error(`Payload inválido para ${task.name}`);
  }
  const started = Date.now();
  const retryCount = job.retryCount ?? 0;
  const isLastAttempt = retryCount >= task.retryLimit;
  try {
    await task.handle(parsed.data, {
      logger: log,
      jobId: job.id,
      attempt: retryCount + 1,
      isLastAttempt,
    });
  } catch (err) {
    // Sem isso, a falha só fica no banco da fila. O payload não entra: leva só IDs, mas não ajuda aqui.
    const { code, details } = err as { code?: unknown; details?: unknown };
    log.warn(
      { attempt: retryCount + 1, isLastAttempt, code, details, message: (err as Error).message },
      isLastAttempt
        ? 'tarefa falhou sem novas tentativas'
        : 'tarefa falhou, nova tentativa agendada',
    );
    throw err;
  }
  log.debug({ durationMs: Date.now() - started }, 'tarefa concluída');
}

export async function registerTasks(
  boss: PgBoss,
  tasks: AnyTask[],
  logger: Logger,
  concurrency: number,
) {
  for (const task of tasks) {
    const dead = deadLetterQueue(task.name);
    await boss.createQueue(dead);
    const retry = {
      retryLimit: task.retryLimit,
      retryDelay: task.retryDelay ?? 0,
      retryBackoff: true,
      expireInSeconds: task.expireInSeconds,
    };
    await boss.createQueue(task.name, { ...retry, deadLetter: dead });
    // Criar não altera uma fila que já existe: a atualização leva as mudanças de tentativas.
    await boss.updateQueue(task.name, retry);
    await boss.work(
      task.name,
      { localConcurrency: concurrency, includeMetadata: true },
      async (jobs) => {
        for (const job of jobs) await runTask(task, job, logger);
      },
    );
    if (task.cron) await boss.schedule(task.name, task.cron, {});
    logger.info({ task: task.name }, 'tarefa registrada');
  }
}
