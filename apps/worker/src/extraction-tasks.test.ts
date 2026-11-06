import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { DOCUMENTS_EXTRACT_QUEUE } from '@linkediner/core/extraction';
import { createLogger } from '@linkediner/observability';
import { JOBS_STRUCTURE_QUEUE } from '@linkediner/core/jobs';
import { RESUMES_GENERATE_QUEUE } from '@linkediner/core/resumes';
import { MATERIALS_GENERATE_QUEUE } from '@linkediner/core/applications';
import { EXPORT_USER_QUEUE, PURGE_USER_QUEUE } from '@linkediner/core/privacy/account';
import { applicationsGenerateMaterial } from './handlers/applications-generate-material';
import {
  privacyExportUser,
  privacyPurgeUser,
  privacyResumePurges,
} from './handlers/privacy-account';
import { documentsExtract } from './handlers/documents-extract';
import { jobsStructure } from './handlers/jobs-structure';
import { resumesGenerate } from './handlers/resumes-generate';
import { privacyExpireAiGenerations } from './handlers/privacy-expire-ai-generations';
import { runTask } from './runner';
import { deadLetterQueue } from './task';

const logger = createLogger({
  service: 'test',
  level: 'silent',
  destination: new Writable({ write: (_c, _e, cb) => cb() }),
});
const scores = { recalculate: vi.fn(async () => ({})) };
const payload = {
  userId: '0193b2b0-0000-7000-8000-00000000000a',
  documentId: '0193b2b0-0000-7000-8000-0000000000d1',
  usageId: '0193b2b0-0000-7000-8000-0000000000f1',
};

describe('documents.extract', () => {
  it('a fila criada pela API é igual à registrada pelo worker', () => {
    const task = documentsExtract({ extract: { run: vi.fn() }, scores });
    expect(task.name).toBe(DOCUMENTS_EXTRACT_QUEUE.name);
    expect(deadLetterQueue(task.name)).toBe(DOCUMENTS_EXTRACT_QUEUE.deadLetter);
  });

  it('recusa payload com dados além dos IDs', async () => {
    const run = vi.fn();
    const task = documentsExtract({ extract: { run }, scores });
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
    const task = documentsExtract({ extract: { run }, scores });
    await runTask(task, { id: 'j', data: payload, retryCount }, logger);
    expect(run).toHaveBeenCalledWith(payload, { isLastAttempt });
  });
});

describe('score depois da extração', () => {
  const task = (
    outcome: 'processed' | 'failed' | 'skipped',
    recalculate = vi.fn(async () => ({})),
  ) => ({
    recalculate,
    task: documentsExtract({
      extract: { run: vi.fn(async () => outcome) },
      scores: { recalculate },
    }),
  });

  it('recalcula o score quando a extração termina', async () => {
    const t = task('processed');
    await runTask(t.task, { id: 'j', data: payload }, logger);
    expect(t.recalculate).toHaveBeenCalledWith(payload.userId);
  });

  it.each(['failed', 'skipped'] as const)(
    'não recalcula quando o resultado é %s',
    async (outcome) => {
      const t = task(outcome);
      await runTask(t.task, { id: 'j', data: payload }, logger);
      expect(t.recalculate).not.toHaveBeenCalled();
    },
  );

  it('falha no score não refaz a extração', async () => {
    const t = task(
      'processed',
      vi.fn(async () => {
        throw new Error('banco fora');
      }),
    );
    await expect(runTask(t.task, { id: 'j', data: payload }, logger)).resolves.toBeUndefined();
  });
});

describe('resumes.generate', () => {
  const job = { userId: payload.userId, resumeId: payload.documentId };

  it('a fila criada pela API é igual à registrada pelo worker', () => {
    const task = resumesGenerate({ generate: { run: vi.fn() } });
    expect(task.name).toBe(RESUMES_GENERATE_QUEUE.name);
    expect(deadLetterQueue(task.name)).toBe(RESUMES_GENERATE_QUEUE.deadLetter);
  });

  it('recusa payload com dados além dos IDs', async () => {
    const run = vi.fn();
    const task = resumesGenerate({ generate: { run } });
    await expect(
      runTask(task, { id: 'j', data: { ...job, text: 'conteúdo' } }, logger),
    ).rejects.toThrow(/Payload inválido/);
    expect(run).not.toHaveBeenCalled();
  });

  it('informa quando é a última tentativa', async () => {
    const run = vi.fn(async () => 'draft' as const);
    const task = resumesGenerate({ generate: { run } });
    await runTask(task, { id: 'j', data: job, retryCount: 2 }, logger);
    expect(run).toHaveBeenCalledWith(job, { isLastAttempt: true });
  });
});

describe('privacidade', () => {
  it('as filas criadas pela API são iguais às registradas pelo worker', () => {
    const purge = privacyPurgeUser({ purge: { run: vi.fn() } });
    expect(purge.name).toBe(PURGE_USER_QUEUE.name);
    expect(deadLetterQueue(purge.name)).toBe(PURGE_USER_QUEUE.deadLetter);
    const exporter = privacyExportUser({ exporter: { run: vi.fn() } });
    expect(exporter.name).toBe(EXPORT_USER_QUEUE.name);
    expect(deadLetterQueue(exporter.name)).toBe(EXPORT_USER_QUEUE.deadLetter);
  });

  it('o expurgo recebe só o ID do pedido, e a exportação só IDs', async () => {
    const run = vi.fn();
    const requestId = payload.documentId;
    await expect(
      runTask(
        privacyPurgeUser({ purge: { run } }),
        { id: 'j', data: { requestId, email: 'pessoa@example.com' } },
        logger,
      ),
    ).rejects.toThrow(/Payload inválido/);
    await expect(
      runTask(
        privacyExportUser({ exporter: { run } }),
        { id: 'j', data: { userId: payload.userId, exportId: requestId, nome: 'Pessoa' } },
        logger,
      ),
    ).rejects.toThrow(/Payload inválido/);
    expect(run).not.toHaveBeenCalled();
  });

  it('avisa quando as exclusões continuam falhando', async () => {
    const task = privacyResumePurges({
      purge: { resumeOpen: vi.fn(async () => ({ resumed: 0, failed: 2 })) },
    });
    expect(task.cron).toBeDefined();
    await expect(runTask(task, { id: 'j', data: {} }, logger)).resolves.toBeUndefined();
  });
});

describe('applications.generate_material', () => {
  const job = {
    userId: payload.userId,
    applicationId: payload.documentId,
    materialId: '0193b2b0-0000-7000-8000-0000000000e1',
    usageId: payload.usageId,
  };

  it('a fila criada pela API é igual à registrada pelo worker', () => {
    const task = applicationsGenerateMaterial({ generate: { run: vi.fn() } });
    expect(task.name).toBe(MATERIALS_GENERATE_QUEUE.name);
    expect(deadLetterQueue(task.name)).toBe(MATERIALS_GENERATE_QUEUE.deadLetter);
  });

  it('recusa payload com dados além dos IDs', async () => {
    const run = vi.fn();
    const task = applicationsGenerateMaterial({ generate: { run } });
    await expect(
      runTask(task, { id: 'j', data: { ...job, questions: ['pergunta'] } }, logger),
    ).rejects.toThrow(/Payload inválido/);
    expect(run).not.toHaveBeenCalled();
  });

  it('informa quando é a última tentativa', async () => {
    const run = vi.fn(async () => 'ready' as const);
    const task = applicationsGenerateMaterial({ generate: { run } });
    await runTask(task, { id: 'j', data: job, retryCount: 2 }, logger);
    expect(run).toHaveBeenCalledWith(job, { isLastAttempt: true });
  });
});

describe('jobs.structure', () => {
  const job = { userId: payload.userId, jobId: payload.documentId, usageId: payload.usageId };

  it('a fila criada pela API é igual à registrada pelo worker', () => {
    const task = jobsStructure({ structure: { run: vi.fn() } });
    expect(task.name).toBe(JOBS_STRUCTURE_QUEUE.name);
    expect(deadLetterQueue(task.name)).toBe(JOBS_STRUCTURE_QUEUE.deadLetter);
  });

  it('recusa payload com o texto da vaga', async () => {
    const run = vi.fn();
    const task = jobsStructure({ structure: { run } });
    await expect(
      runTask(task, { id: 'j', data: { ...job, text: 'texto' } }, logger),
    ).rejects.toThrow(/Payload inválido/);
    expect(run).not.toHaveBeenCalled();
  });

  it('informa quando é a última tentativa', async () => {
    const run = vi.fn(async () => 'ready' as const);
    const task = jobsStructure({ structure: { run } });
    await runTask(task, { id: 'j', data: job, retryCount: 2 }, logger);
    expect(run).toHaveBeenCalledWith(job, { isLastAttempt: true });
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
