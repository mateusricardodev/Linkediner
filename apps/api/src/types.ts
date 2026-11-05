import type { FastifyInstance, FastifyTypeProvider } from 'fastify';

/** Instância do Fastify com qualquer logger e type provider (o servidor usa pino + Zod). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFastifyInstance = FastifyInstance<any, any, any, any, FastifyTypeProvider>;
