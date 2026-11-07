import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

const respond = (status: number, body?: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status })),
  );

afterEach(() => vi.unstubAllGlobals());

describe('cliente da API', () => {
  it('envia o cookie de sessão e o corpo em JSON', async () => {
    respond(200, { ok: true });
    await expect(api('/v1/x', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/x'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: '{"a":1}',
      }),
    );
  });

  it('usa a mensagem segura da nossa API e mantém os detalhes', async () => {
    // Mesmo formato do error-handler da API: a mensagem vem em `title`.
    respond(429, {
      type: 'https://linkediner.dev/problems/quota-exceeded',
      title: 'O limite do seu plano acabou.',
      status: 429,
      code: 'QUOTA_EXCEEDED',
      details: { feature: 'job.match' },
    });
    const error = await api('/v1/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: 'O limite do seu plano acabou.',
      status: 429,
      code: 'QUOTA_EXCEEDED',
      details: { feature: 'job.match' },
    });
  });

  it('prefere `detail` quando existe e esconde o erro interno', async () => {
    respond(400, {
      title: 'Dados inválidos',
      detail: 'Confira a data.',
      code: 'VALIDATION_FAILED',
    });
    await expect(api('/v1/x')).rejects.toThrow('Confira a data.');
    respond(500, { title: 'Erro interno', status: 500, code: 'INTERNAL' });
    await expect(api('/v1/x')).rejects.toThrow('Algo deu errado');
  });

  it('traduz o erro de login, e não mostra texto desconhecido de terceiros', async () => {
    respond(401, { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' });
    await expect(api('/v1/auth/sign-in/email')).rejects.toThrow('E-mail ou senha incorretos.');
    respond(400, { code: 'OUTRO', message: 'internal stack trace' });
    await expect(api('/v1/auth/x')).rejects.toThrow('Algo deu errado');
  });

  it('sem conexão, dá um erro próprio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('failed to fetch');
      }),
    );
    await expect(api('/v1/x')).rejects.toMatchObject({ code: 'OFFLINE', status: 0 });
  });

  it('resposta sem corpo não é erro', async () => {
    respond(204);
    await expect(api('/v1/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
