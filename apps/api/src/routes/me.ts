import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ConsentPurpose,
  MeResponse,
  ProblemDetails,
  UpdateConsentBody,
} from '@linkediner/contracts';
import type { DrizzleUserReader } from '@linkediner/core/identity';
import {
  CURRENT_CONSENT_VERSIONS,
  type ConsentService,
  type ConsentStatus,
} from '@linkediner/core/privacy';
import { AppError } from '@linkediner/core/shared';
import { actorOf, requireActor } from '../plugins/auth';

export interface MeDeps {
  users: Pick<DrizzleUserReader, 'getById'>;
  consents: Pick<ConsentService, 'status' | 'decide'>;
  syntheticDataOnly: boolean;
}

const toDto = (s: ConsentStatus) => ({ ...s, versions: CURRENT_CONSENT_VERSIONS });

export const meRoutes =
  (deps: MeDeps): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/v1/me',
      {
        preHandler: requireActor,
        schema: {
          tags: ['conta'],
          summary: 'Usuário autenticado e estado dos consentimentos',
          response: { 200: MeResponse, 401: ProblemDetails },
        },
      },
      async (req) => {
        const { userId } = actorOf(req);
        const [user, consents] = await Promise.all([
          deps.users.getById(userId),
          deps.consents.status(userId),
        ]);
        if (!user) throw new AppError('UNAUTHENTICATED', 'Sessão inválida.');
        return { user, consents: toDto(consents), syntheticDataOnly: deps.syntheticDataOnly };
      },
    );

    app.put(
      '/v1/me/consents/:purpose',
      {
        preHandler: requireActor,
        schema: {
          tags: ['conta'],
          summary: 'Concede ou revoga um consentimento',
          params: z.object({ purpose: ConsentPurpose }),
          body: UpdateConsentBody,
          response: { 200: MeResponse.shape.consents, 401: ProblemDetails },
        },
      },
      async (req) => {
        const { userId } = actorOf(req);
        return toDto(await deps.consents.decide(userId, req.params.purpose, req.body.granted));
      },
    );
  };
