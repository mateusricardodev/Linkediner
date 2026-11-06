import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  DataExportDto,
  DeleteAccountBody,
  DeletionAcceptedDto,
  ProblemDetails,
} from '@linkediner/contracts';
import type {
  AccountDeletionService,
  DataExport,
  DataExportService,
} from '@linkediner/core/privacy/account';
import { actorOf, requireActor } from '../plugins/auth';

export interface PrivacyDeps {
  accountDeletion: AccountDeletionService;
  dataExports: DataExportService;
}

const toDto = (e: DataExport & { downloadUrl: string | null }) => ({
  id: e.id,
  status: e.status,
  sizeBytes: e.sizeBytes,
  downloadUrl: e.downloadUrl,
  expiresAt: e.expiresAt?.toISOString() ?? null,
  createdAt: e.createdAt.toISOString(),
});

const errors = {
  400: ProblemDetails,
  401: ProblemDetails,
  403: ProblemDetails,
  503: ProblemDetails,
};

/**
 * Direitos do titular (LGPD). Exigem só o login: quem revogou os termos também pode sair e levar
 * os próprios dados.
 */
export const privacyRoutes =
  (deps: PrivacyDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = requireActor;
    const tags = ['privacidade'];

    app.post(
      '/v1/privacy/delete-account',
      {
        preHandler,
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
        schema: {
          tags,
          summary: 'Encerra as sessões e apaga a conta e todos os dados. Não pode ser desfeito',
          body: DeleteAccountBody,
          response: { 202: DeletionAcceptedDto, ...errors },
        },
      },
      async (req, reply) => {
        const { userId, sessionCreatedAt } = actorOf(req);
        const request = await deps.accountDeletion.request(userId, {
          confirmEmail: req.body.confirmEmail,
          sessionCreatedAt,
        });
        return reply
          .status(202)
          .send({ status: request.status === 'failed' ? 'failed' : 'pending' });
      },
    );

    app.post(
      '/v1/privacy/export',
      {
        preHandler,
        config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
        schema: {
          tags,
          summary: 'Pede um arquivo com todos os dados da conta. O arquivo vale por 7 dias',
          response: { 202: DataExportDto, ...errors },
        },
      },
      async (req, reply) => {
        const { userId, sessionCreatedAt } = actorOf(req);
        const created = await deps.dataExports.request(userId, sessionCreatedAt);
        return reply.status(202).send(toDto({ ...created, downloadUrl: null }));
      },
    );

    app.get(
      '/v1/privacy/exports',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Exportações válidas. As prontas trazem uma URL de download de curta duração',
          response: { 200: z.array(DataExportDto), ...errors },
        },
      },
      async (req) => {
        const { userId, sessionCreatedAt } = actorOf(req);
        return (await deps.dataExports.list(userId, { sessionCreatedAt })).map(toDto);
      },
    );
  };
