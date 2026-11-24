import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '@linkediner/observability';
import { privacyExpireDocuments } from './handlers/privacy-expire-documents';
import { systemHeartbeat } from './handlers/system-heartbeat';
import { runTask } from './runner';

const logger = createLogger({
  service: 'test',
  level: 'silent',
  destination: new Writable({ write: (_c, _e, cb) => cb() }),
});

describe('runTask', () => {
  it('executa o handler com payload válido', async () => {
    const ping = vi.fn(async () => {});
    await runTask(systemHeartbeat({ ping }), { id: 'job-1', data: {} }, logger);
    expect(ping).toHaveBeenCalledOnce();
  });

  it('rejeita payload fora do esquema sem chamar o handler', async () => {
    const ping = vi.fn(async () => {});
    await expect(
      runTask(systemHeartbeat({ ping }), { id: 'job-2', data: { email: 'x@y.com' } }, logger),
    ).rejects.toThrow(/Payload inválido/);
    expect(ping).not.toHaveBeenCalled();
  });

  it('propaga falha do handler para a fila tentar de novo', async () => {
    const ping = vi.fn(async () => Promise.reject(new Error('db fora')));
    await expect(
      runTask(systemHeartbeat({ ping }), { id: 'job-3', data: {} }, logger),
    ).rejects.toThrow('db fora');
  });

  it('registra a falha no log, dizendo se haverá nova tentativa', async () => {
    const lines: string[] = [];
    const captured = createLogger({
      service: 'test',
      level: 'warn',
      destination: new Writable({
        write: (chunk, _e, cb) => {
          lines.push(String(chunk));
          cb();
        },
      }),
    });
    const ping = vi.fn(async () =>
      Promise.reject(Object.assign(new Error('provedor'), { code: 'DEPENDENCY_UNAVAILABLE' })),
    );
    const task = systemHeartbeat({ ping });
    await expect(runTask(task, { id: 'job-4', data: {} }, captured)).rejects.toThrow();
    await expect(
      runTask(task, { id: 'job-5', data: {}, retryCount: task.retryLimit }, captured),
    ).rejects.toThrow();
    const logged = lines.map((line) => JSON.parse(line));
    expect(logged).toMatchObject([
      { msg: 'tarefa falhou, nova tentativa agendada', code: 'DEPENDENCY_UNAVAILABLE', attempt: 1 },
      { msg: 'tarefa falhou sem novas tentativas', isLastAttempt: true },
    ]);
  });
});

describe('privacy.expire_documents', () => {
  it('roda a expiração e é agendada diariamente', async () => {
    const run = vi.fn(async () => ({ deleted: 3 }));
    const task = privacyExpireDocuments({ expire: { run } });
    await runTask(task, { id: 'job-4', data: {} }, logger);
    expect(run).toHaveBeenCalledOnce();
    expect(task.cron).toMatch(/^\d+ \d+ \* \* \*$/);
  });
});
