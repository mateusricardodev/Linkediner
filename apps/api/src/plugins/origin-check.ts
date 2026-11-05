import type { AnyFastifyInstance } from '../types';
import { AppError } from '@linkediner/core/shared';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Proteção contra CSRF nas rotas próprias da API: toda mutação autenticada por cookie
 * precisa vir do frontend oficial (cabeçalho Origin). As rotas /v1/auth têm a verificação do Better Auth.
 */
export function registerOriginCheck(app: AnyFastifyInstance, webOrigin: string) {
  app.addHook('onRequest', async (req) => {
    if (
      SAFE_METHODS.has(req.method) ||
      !req.url.startsWith('/v1/') ||
      req.url.startsWith('/v1/auth/')
    )
      return;
    if (!req.headers.cookie) return;
    if (req.headers.origin !== webOrigin) {
      throw new AppError('FORBIDDEN', 'Origem da requisição não permitida.');
    }
  });
}
