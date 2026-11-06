import { Writable } from 'node:stream';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { startTestDatabase } from '@linkediner/db/testing';
import { createLogger } from '@linkediner/observability';
import { PgBossPendingTasks } from './pg-boss-pending-tasks';
import { registerTasks } from './runner';
import { defineTask } from './task';

const logger = createLogger({
  service: 'test',
  level: 'silent',
  destination: new Writable({ write: (_c, _e, cb) => cb() }),
});
let ctx: Awaited<ReturnType<typeof startTestDatabase>>;
let boss: PgBoss;

beforeAll(async () => {
  ctx = await startTestDatabase();
  boss = new PgBoss({ connectionString: ctx.container.getConnectionUri(), schema: 'pgboss' });
  await boss.start();
}, 120_000);

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await ctx?.stop();
});

describe('worker com pg-boss', () => {
  it('consome uma tarefa enviada para a fila', async () => {
    const received: string[] = [];
    const task = defineTask({
      name: 'test.echo',
      payload: z.object({ documentId: z.string() }),
      retryLimit: 0,
      expireInSeconds: 10,
      async handle(p) {
        received.push(p.documentId);
      },
    });
    await registerTasks(boss, [task], logger, 1);
    await boss.send('test.echo', { documentId: 'doc-123' });
    await expect.poll(() => received, { timeout: 25_000, interval: 200 }).toEqual(['doc-123']);
  });

  it('cancela só as tarefas na fila do usuário que pediu a exclusão', async () => {
    const queue = 'test.user_tasks';
    await boss.createQueue(queue);
    const alvo = { userId: '0193b2b0-0000-7000-8000-00000000000a' };
    const outra = { userId: '0193b2b0-0000-7000-8000-00000000000b' };
    await boss.send(queue, alvo);
    await boss.send(queue, alvo);
    await boss.send(queue, outra);

    const tasks = new PgBossPendingTasks(boss, [queue]);
    expect(await tasks.cancelForUser(alvo.userId)).toBe(2);
    expect(await boss.findJobs(queue, { data: alvo, queued: true })).toEqual([]);
    expect(await boss.findJobs(queue, { data: outra, queued: true })).toHaveLength(1);
  });
});
