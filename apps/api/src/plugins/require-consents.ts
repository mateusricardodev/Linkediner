import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ConsentService } from '@linkediner/core/privacy';
import { AppError } from '@linkediner/core/shared';
import { actorOf } from './auth';

/**
 * Bloqueia as rotas do produto até o usuário aceitar os consentimentos obrigatórios
 * (termos e privacidade) na versão vigente.
 */
export const requireConsents =
  (consents: Pick<ConsentService, 'status'>) =>
  async (req: FastifyRequest, _reply: FastifyReply) => {
    const { userId } = actorOf(req);
    const status = await consents.status(userId);
    if (status.missingRequired.length) {
      throw new AppError(
        'CONSENT_REQUIRED',
        'Aceite os termos de uso e a política de privacidade para continuar.',
        {
          missing: status.missingRequired,
        },
      );
    }
  };
