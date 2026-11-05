import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import type { AnyFastifyInstance } from '../types';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import type { ProblemDetails } from '@linkediner/contracts';
import { isAppError } from '@linkediner/core/shared';

const PROBLEM_BASE = 'https://linkediner.dev/problems/';

function send(
  reply: FastifyReply,
  req: FastifyRequest,
  problem: Omit<ProblemDetails, 'requestId' | 'instance'>,
) {
  const body: ProblemDetails = { ...problem, instance: req.url, requestId: req.id };
  return reply.status(problem.status).type('application/problem+json').send(body);
}

/**
 * Converte qualquer erro em Problem Details (RFC 9457).
 * Erros inesperados viram 500 com mensagem genérica: detalhes internos ficam só no log.
 */
export function registerErrorHandler(app: AnyFastifyInstance) {
  app.setNotFoundHandler((req, reply) =>
    send(reply, req, {
      type: `${PROBLEM_BASE}not-found`,
      title: 'Recurso não encontrado',
      status: 404,
      code: 'NOT_FOUND',
    }),
  );

  app.setErrorHandler((error: FastifyError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return send(reply, req, {
        type: `${PROBLEM_BASE}validation-failed`,
        title: 'Dados inválidos',
        status: 400,
        code: 'VALIDATION_FAILED',
        errors: error.validation.map((v) => ({
          path: v.instancePath.replace(/^\//, '').replaceAll('/', '.'),
          message: v.message ?? 'inválido',
        })),
      });
    }

    if (isAppError(error)) {
      if (error.status >= 500) req.log.error({ err: error }, 'erro de domínio');
      return send(reply, req, {
        type: `${PROBLEM_BASE}${error.code.toLowerCase().replaceAll('_', '-')}`,
        title: error.message,
        status: error.status,
        code: error.code,
        ...(error.details && error.status < 500 ? { details: error.details } : {}),
      });
    }

    if (error.statusCode === 429) {
      return send(reply, req, {
        type: `${PROBLEM_BASE}rate-limited`,
        title: 'Muitas requisições',
        status: 429,
        code: 'RATE_LIMITED',
      });
    }

    if (
      error.statusCode &&
      error.statusCode >= 400 &&
      error.statusCode < 500 &&
      !isResponseSerializationError(error)
    ) {
      return send(reply, req, {
        type: `${PROBLEM_BASE}bad-request`,
        title: 'Requisição inválida',
        status: error.statusCode,
        code: 'BAD_REQUEST',
      });
    }

    req.log.error({ err: error }, 'erro inesperado');
    return send(reply, req, {
      type: `${PROBLEM_BASE}internal`,
      title: 'Erro interno',
      status: 500,
      code: 'INTERNAL',
    });
  });
}
