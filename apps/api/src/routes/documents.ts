import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  DocumentDto,
  DownloadResponse,
  ProblemDetails,
  RequestUploadBody,
  RequestUploadResponse,
} from '@linkediner/contracts';
import type { DocumentRecord, DocumentService } from '@linkediner/core/documents';
import type { ExtractionRequests } from '@linkediner/core/extraction';
import type { ConsentService } from '@linkediner/core/privacy';
import { actorOf, requireActor } from '../plugins/auth';
import { requireConsents } from '../plugins/require-consents';

export interface DocumentDeps {
  documents: DocumentService;
  extraction: ExtractionRequests;
  consents: Pick<ConsentService, 'status'>;
}

const toDto = (d: DocumentRecord) => ({
  id: d.id,
  kind: d.kind,
  status: d.status,
  failureCode: d.failureCode,
  mimeType: d.mimeType,
  sizeBytes: d.sizeBytes,
  uploadedAt: d.uploadedAt?.toISOString() ?? null,
  expiresAt: d.expiresAt.toISOString(),
  createdAt: d.createdAt.toISOString(),
});

const errors = {
  400: ProblemDetails,
  401: ProblemDetails,
  403: ProblemDetails,
  404: ProblemDetails,
};
const Params = z.object({ id: z.uuid() });

/** Upload de currículo e do PDF do LinkedIn (M-03/M-04). O arquivo vai direto ao storage por URL assinada. */
export const documentRoutes =
  (deps: DocumentDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = [requireActor, requireConsents(deps.consents)];
    const tags = ['documentos'];

    app.post(
      '/v1/documents',
      {
        preHandler,
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: {
          tags,
          summary: 'Inicia o upload de um documento e devolve a URL assinada',
          body: RequestUploadBody,
          response: { 201: RequestUploadResponse, ...errors },
        },
      },
      async (req, reply) => {
        const { document, upload } = await deps.documents.requestUpload(
          actorOf(req).userId,
          req.body,
        );
        return reply.status(201).send({ document: toDto(document), upload });
      },
    );

    app.post(
      '/v1/documents/:id/complete',
      {
        preHandler,
        schema: {
          tags,
          summary:
            'Confirma o upload e inicia a análise, se o processamento por IA estiver autorizado',
          params: Params,
          response: { 200: DocumentDto, 409: ProblemDetails, ...errors },
        },
      },
      async (req) => {
        const { userId } = actorOf(req);
        const document = await deps.documents.completeUpload(userId, req.params.id);
        return toDto(await deps.extraction.requestIfAllowed(userId, document));
      },
    );

    app.post(
      '/v1/documents/:id/extract',
      {
        preHandler,
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: {
          tags,
          summary: 'Pede a análise do documento. Exige o consentimento de processamento por IA',
          params: Params,
          response: { 200: DocumentDto, 409: ProblemDetails, 503: ProblemDetails, ...errors },
        },
      },
      async (req) => toDto(await deps.extraction.request(actorOf(req).userId, req.params.id)),
    );

    app.get(
      '/v1/documents',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Lista os documentos do usuário',
          response: { 200: z.array(DocumentDto), ...errors },
        },
      },
      async (req) => (await deps.documents.list(actorOf(req).userId)).map(toDto),
    );

    app.get(
      '/v1/documents/:id',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Detalhe de um documento',
          params: Params,
          response: { 200: DocumentDto, ...errors },
        },
      },
      async (req) => toDto(await deps.documents.get(actorOf(req).userId, req.params.id)),
    );

    app.get(
      '/v1/documents/:id/download',
      {
        preHandler,
        schema: {
          tags,
          summary: 'URL temporária para baixar o arquivo',
          params: Params,
          response: { 200: DownloadResponse, 409: ProblemDetails, ...errors },
        },
      },
      async (req) => ({
        url: await deps.documents.downloadUrl(actorOf(req).userId, req.params.id),
        expiresInSeconds: 60,
      }),
    );

    app.delete(
      '/v1/documents/:id',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Apaga o documento e o arquivo imediatamente',
          params: Params,
          response: { 204: z.null(), ...errors },
        },
      },
      async (req, reply) => {
        await deps.documents.delete(actorOf(req).userId, req.params.id);
        return reply.status(204).send(null);
      },
    );
  };
