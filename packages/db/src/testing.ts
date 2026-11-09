import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createDb, type DbHandle } from './client';
import { runMigrations } from './migrate';

/**
 * Para o container sem derrubar a suíte. Com a máquina carregada, o Docker pode recusar a remoção
 * porque o container ainda está parando (HTTP 409). Os testes já terminaram: o que sobrar, o Ryuk do
 * Testcontainers remove ao fim da execução.
 */
async function stopQuietly(container: { stop(options?: { timeout?: number }): Promise<unknown> }) {
  try {
    await container.stop({ timeout: 10_000 });
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    const message = error instanceof Error ? error.message : '';
    if (
      status !== 409 &&
      !/container is running|removal of container .* is already in progress/i.test(message)
    ) {
      throw error;
    }
  }
}

/** Sobe um Postgres com pgvector em container e aplica as migrações. Uso exclusivo em testes. */
export async function startTestDatabase(): Promise<{
  handle: DbHandle;
  container: StartedPostgreSqlContainer;
  stop(): Promise<void>;
}> {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  const handle = createDb(container.getConnectionUri(), { max: 4 });
  await runMigrations(handle.db);
  return {
    handle,
    container,
    stop: async () => {
      await handle.close();
      await stopQuietly(container);
    },
  };
}
