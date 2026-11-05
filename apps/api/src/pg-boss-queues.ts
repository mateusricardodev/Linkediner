import type { PgBoss } from 'pg-boss';

interface QueueDefinition {
  name: string;
  deadLetter: string;
  retryLimit: number;
  expireInSeconds: number;
}

/**
 * A API só envia jobs. Quem consome é o worker.
 * Criar a fila é idempotente: a API pode subir antes do worker.
 */
export async function createQueue<P extends object>(boss: PgBoss, definition: QueueDefinition) {
  const { name, deadLetter, retryLimit, expireInSeconds } = definition;
  await boss.createQueue(deadLetter);
  await boss.createQueue(name, { retryLimit, retryBackoff: true, expireInSeconds, deadLetter });
  return {
    async enqueue(payload: P) {
      await boss.send(name, payload);
    },
  };
}
