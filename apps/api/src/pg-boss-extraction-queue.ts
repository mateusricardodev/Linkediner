import type { PgBoss } from 'pg-boss';
import { DOCUMENTS_EXTRACT_QUEUE, type ExtractionQueue } from '@linkediner/core/extraction';

/** A API só envia jobs para a fila. Quem consome é o worker. */
export async function createExtractionQueue(boss: PgBoss): Promise<ExtractionQueue> {
  const { name, deadLetter, retryLimit, expireInSeconds } = DOCUMENTS_EXTRACT_QUEUE;
  // Criar a fila é idempotente: a API pode subir antes do worker.
  await boss.createQueue(deadLetter);
  await boss.createQueue(name, { retryLimit, retryBackoff: true, expireInSeconds, deadLetter });
  return {
    async enqueue(payload) {
      await boss.send(name, payload);
    },
  };
}
