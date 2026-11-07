import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '@linkediner/core/shared';
import { createLogger } from '@linkediner/observability';
import { buildServer } from './server';

const silent = createLogger({
  service: 'test',
  level: 'silent',
  destination: new Writable({ write: (_c, _e, cb) => cb() }),
});
let app: Awaited<ReturnType<typeof buildServer>>;

async function build(checks: Record<string, () => Promise<void>> = { database: async () => {} }) {
  app = await buildServer({
    config: { NODE_ENV: 'test', WEB_ORIGIN: 'http://localhost:3000' },
    logger: silent,
    health: { checks },
  });
  return app;
}

afterEach(async () => app?.close());

describe('API base', () => {
  it('GET /health responde ok e devolve x-request-id', async () => {
    await build();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it.each(['PUT', 'PATCH', 'DELETE'])(
    'o site pode chamar %s, e outra origem não',
    async (method) => {
      await build();
      const preflight = (origin: string) =>
        app.inject({
          method: 'OPTIONS',
          url: '/v1/me/consents/terms',
          headers: { origin, 'access-control-request-method': method },
        });
      const allowed = await preflight('http://localhost:3000');
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');
      expect(allowed.headers['access-control-allow-methods']).toContain(method);
      const denied = await preflight('https://outro.example');
      expect(denied.headers['access-control-allow-origin']).not.toBe('https://outro.example');
    },
  );

  it('GET /health/ready devolve 503 quando o banco falha', async () => {
    await build({ database: async () => Promise.reject(new Error('down')) });
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'degraded', checks: { database: 'fail' } });
  });

  it('rota inexistente devolve Problem Details 404', async () => {
    await build();
    const res = await app.inject({ method: 'GET', url: '/nao-existe' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ code: 'NOT_FOUND', status: 404, instance: '/nao-existe' });
  });

  it('AppError vira Problem Details com o código certo', async () => {
    await build();
    app.get('/teste/quota', async () => {
      throw new AppError('QUOTA_EXCEEDED', 'Limite do plano atingido');
    });
    const res = await app.inject({ method: 'GET', url: '/teste/quota' });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ code: 'QUOTA_EXCEEDED', title: 'Limite do plano atingido' });
  });

  it('erro inesperado vira 500 genérico, sem vazar detalhes', async () => {
    await build();
    app.get('/teste/boom', async () => {
      throw new Error('detalhe interno com email maria@example.com');
    });
    const res = await app.inject({ method: 'GET', url: '/teste/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('maria@example.com');
    expect(res.json()).toMatchObject({ code: 'INTERNAL' });
  });

  it('valida entrada com Zod e devolve VALIDATION_FAILED', async () => {
    await build();
    app.post(
      '/teste/eco',
      { schema: { body: z.object({ email: z.email() }) } },
      async (req) => req.body,
    );
    const res = await app.inject({ method: 'POST', url: '/teste/eco', payload: { email: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('gera a especificação OpenAPI', async () => {
    await build();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    expect(res.json().paths).toHaveProperty('/health');
  });
});
