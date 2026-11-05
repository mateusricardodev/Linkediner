import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AnyFastifyInstance } from '../types';
import { resolveActor, type Actor, type Auth } from '@linkediner/core/identity';
import { AppError } from '@linkediner/core/shared';

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor | null;
  }
}

export function toFetchHeaders(req: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value !== undefined) headers.set(key, String(value));
  }
  return headers;
}

/**
 * Monta as rotas do Better Auth em /v1/auth/* e resolve a sessão em cada requisição.
 * O cookie de sessão é HttpOnly. A API nunca devolve o token de sessão no corpo.
 */
export async function registerAuth(app: AnyFastifyInstance, auth: Auth) {
  app.decorateRequest('actor', null);

  app.route({
    method: ['GET', 'POST'],
    url: '/v1/auth/*',
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { hide: true },
    async handler(req, reply) {
      const url = new URL(req.url, `${req.protocol}://${req.host}`);
      const hasBody = req.method !== 'GET' && req.body !== undefined;
      const response = await auth.handler(
        new Request(url, {
          method: req.method,
          headers: toFetchHeaders(req),
          ...(hasBody
            ? { body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body) }
            : {}),
        }),
      );
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
    },
  });

  app.addHook('preHandler', async (req) => {
    if (!req.url.startsWith('/v1/') || req.url.startsWith('/v1/auth/')) return;
    if (!req.headers.cookie) return;
    req.actor = await resolveActor(auth, toFetchHeaders(req));
  });
}

/** Garante usuário autenticado. Use como preHandler nas rotas protegidas. */
export async function requireActor(req: FastifyRequest, _reply: FastifyReply) {
  if (!req.actor) throw new AppError('UNAUTHENTICATED', 'Faça login para continuar.');
}

export function actorOf(req: FastifyRequest): Actor {
  if (!req.actor) throw new AppError('UNAUTHENTICATED', 'Faça login para continuar.');
  return req.actor;
}
