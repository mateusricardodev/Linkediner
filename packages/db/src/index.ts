export {
  createDb,
  withUserContext,
  pingDb,
  type Database,
  type DbHandle,
  type Transaction,
} from './client';
export { runMigrations, migrationsFolder } from './migrate';
export * as schema from './schema';
// Operadores do Drizzle reexportados: os módulos usam sempre a mesma instância do pacote db.
export { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
