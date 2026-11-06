import type { PgBoss } from 'pg-boss';
import type { PendingTasks } from '@linkediner/core/privacy/account';

/**
 * Cancela o que ainda está na fila para o usuário. Uma tarefa já em execução termina sozinha: sem
 * o usuário no banco, ela não consegue gravar nada, e a chave estrangeira impede dado órfão.
 */
export class PgBossPendingTasks implements PendingTasks {
  constructor(
    private readonly boss: PgBoss,
    private readonly queues: readonly string[],
  ) {}

  async cancelForUser(userId: string): Promise<number> {
    let cancelled = 0;
    for (const queue of this.queues) {
      const jobs = await this.boss.findJobs(queue, { data: { userId }, queued: true });
      if (jobs.length === 0) continue;
      await this.boss.cancel(
        queue,
        jobs.map((job) => job.id),
      );
      cancelled += jobs.length;
    }
    return cancelled;
  }
}
