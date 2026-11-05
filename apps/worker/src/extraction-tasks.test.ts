import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { DOCUMENTS_EXTRACT_QUEUE } from '@linkediner/core/extraction';
import { createLogger } from '@linkediner/observability';
import { documentsExtract } from './handlers/documents-extract';
import { privacyExpireAiGenerations } from './handlers/privacy-expire-ai-generations';
import { runTask } from './runner';
import { deadLetterQueue } from './task';

const logger = createLogger({
  service: 'test',
  level: 'silent',
  destination: new Writable({ write: (_c, _e, cb) => cb() }),
});
const payload = {
  userId: '0193b2b0-0000-7000-8000-00000000000a',
  documentId: '0193b2b0-0000-7000-8000-0000000000d1',
};

describe('documents.extract', () => {
  it('a fila criada pela API é igual à registrada pelo worker', () => {
    const task = documentsExtract({ extract: { run: vi.fn() } });
    expect(task.name).toBe(DOCUMENTS_EXTRACT_QUEUE.name);
    expect(deadLetterQueue(task.name)).toBe(DOCUMENTS_EXTRACT_QUEUE.deadLetter);
  });

  it('recusa payload com dados além dos IDs', async () => {
    const run = vi.fn();
    const task = documentsExtract({ extract: { run } });
    await expect(
      runTask(task, { id: 'j', data: { ...payload, text: 'conteúdo do currículo' } }, logger),
    ).rejects.toThrow(/Payload inválido/);
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    [0, false],
    [1, false],
    [2, true],
  ])('tentativa com retryCount %i: última = %s', async (retryCount, isLastAttempt) => {
    const run = vi.fn(async () => 'processed' as const);
    const task = documentsExtract({ extract: { run } });
    await runTask(task, { id: 'j', data: payload, retryCount }, logger);
    expect(run).toHaveBeenCalledWith(payload, { isLastAttempt });
  });
});

describe('privacy.expire_ai_generations', () => {
  it('apaga registros com mais de 90 dias e é agendada diariamente', async () => {
    const deleteOlderThan = vi.fn(async () => 2);
    const task = privacyExpireAiGenerations({
      generations: { deleteOlderThan },
      now: () => new Date('2026-11-05T00:00:00Z'),
    });
    await runTask(task, { id: 'j', data: {} }, logger);
    expect(deleteOlderThan).toHaveBeenCalledWith(new Date('2026-08-07T00:00:00Z'));
    expect(task.cron).toMatch(/^\d+ \d+ \* \* \*$/);
  });
});
