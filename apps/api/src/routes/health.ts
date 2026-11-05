import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HealthResponse, ReadinessResponse } from '@linkediner/contracts';

export interface HealthDeps {
  /** Verificações de dependências. Cada uma deve lançar erro se a dependência estiver indisponível. */
  checks: Record<string, () => Promise<void>>;
}

export const healthRoutes =
  (deps: HealthDeps): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/health',
      {
        schema: {
          tags: ['sistema'],
          summary: 'Liveness: o processo está de pé',
          response: { 200: HealthResponse },
        },
      },
      async () => ({ status: 'ok' as const }),
    );

    app.get(
      '/health/ready',
      {
        schema: {
          tags: ['sistema'],
          summary: 'Readiness: dependências acessíveis',
          response: { 200: ReadinessResponse, 503: ReadinessResponse },
        },
      },
      async (req, reply) => {
        const entries = await Promise.all(
          Object.entries(deps.checks).map(async ([name, check]) => {
            try {
              await check();
              return [name, 'ok'] as const;
            } catch (err) {
              req.log.warn({ err, check: name }, 'verificação de prontidão falhou');
              return [name, 'fail'] as const;
            }
          }),
        );
        const checks = Object.fromEntries(entries);
        const healthy = entries.every(([, s]) => s === 'ok');
        return reply
          .status(healthy ? 200 : 503)
          .send({ status: healthy ? 'ok' : 'degraded', checks });
      },
    );
  };
