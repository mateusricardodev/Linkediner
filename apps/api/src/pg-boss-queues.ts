import type { PgBoss } from 'pg-boss';

interface QueueDefinition {
  name: string;
  deadLetter: string;
  retryLimit: number;
  retryDelay?: number;
  expireInSeconds: number;
}

/**
 * A API só envia jobs. Quem consome é o worker.
 * Criar a fila é idempotente: a API pode subir antes do worker.
 */
export async function createQueue<P extends object>(boss: PgBoss, definition: QueueDefinition) {
  const { name, deadLetter, retryLimit, retryDelay = 0, expireInSeconds } = definition;
  const retry = { retryLimit, retryDelay, retryBackoff: true, expireInSeconds };
  await boss.createQueue(deadLetter);
  await boss.createQueue(name, { ...retry, deadLetter });
  // Criar não altera uma fila que já existe: a atualização leva as mudanças de tentativas.
  await boss.updateQueue(name, retry);
  return {
    async enqueue(payload: P) {
      await boss.send(name, payload);
    },
  };
}
