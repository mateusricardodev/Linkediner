import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createDb, type DbHandle } from './client';
import { runMigrations } from './migrate';

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
      await container.stop();
    },
  };
}
