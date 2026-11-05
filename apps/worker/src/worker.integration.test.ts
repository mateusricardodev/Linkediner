import { Writable } from 'node:stream';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { startTestDatabase } from '@linkediner/db/testing';
import { createLogger } from '@linkediner/observability';
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
});
