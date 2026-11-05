import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  DecideResumeItemBody,
  ExportResumeQuery,
  ProblemDetails,
  ResumeDto,
} from '@linkediner/contracts';
import type { ConsentService } from '@linkediner/core/privacy';
import type { Resume, ResumeService } from '@linkediner/core/resumes';
import type { ResumeExportService } from '@linkediner/core/resumes/export';
import { actorOf, requireActor } from '../plugins/auth';
import { requireConsents } from '../plugins/require-consents';

export interface ResumeDeps {
  resumes: ResumeService;
  resumeExport: ResumeExportService;
  consents: Pick<ConsentService, 'status'>;
}

const toDto = (r: Resume) => ({
  ...r,
  approvedAt: r.approvedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
});
const errors = {
  400: ProblemDetails,
  401: ProblemDetails,
  403: ProblemDetails,
  404: ProblemDetails,
};
const Params = z.object({ id: z.uuid() });

/** Currículo melhorado (M-07), aprovação e exportação (M-08). */
export const resumeRoutes =
  (deps: ResumeDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = [requireActor, requireConsents(deps.consents)];
    const tags = ['currículos'];

    app.post(
      '/v1/resumes',
      {
        preHandler,
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
        schema: {
          tags,
          summary: 'Pede um currículo melhorado. Exige o consentimento de processamento por IA',
          response: { 202: ResumeDto, 409: ProblemDetails, 503: ProblemDetails, ...errors },
        },
      },
      async (req, reply) =>
        reply.status(202).send(toDto(await deps.resumes.request(actorOf(req).userId))),
    );

    app.get(
      '/v1/resumes',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Lista os currículos',
          response: { 200: z.array(ResumeDto), ...errors },
        },
      },
      async (req) => (await deps.resumes.list(actorOf(req).userId)).map(toDto),
    );

    app.get(
      '/v1/resumes/:id',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Detalhe de um currículo',
          params: Params,
          response: { 200: ResumeDto, ...errors },
        },
      },
      async (req) => toDto(await deps.resumes.get(actorOf(req).userId, req.params.id)),
    );

    app.patch(
      '/v1/resumes/:id/items/:itemId',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Confirma, corrige ou remove uma frase do currículo',
          params: z.object({ id: z.uuid(), itemId: z.uuid() }),
          body: DecideResumeItemBody,
          response: { 200: ResumeDto, ...errors },
        },
      },
      async (req) => {
        const { body } = req;
        const decision =
          body.action === 'remove'
            ? ({ action: 'remove' } as const)
            : ({ action: 'confirm', ...(body.text ? { text: body.text } : {}) } as const);
        return toDto(
          await deps.resumes.decideItem(
            actorOf(req).userId,
            req.params.id,
            req.params.itemId,
            decision,
          ),
        );
      },
    );

    app.post(
      '/v1/resumes/:id/approve',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Aprova o currículo. Exige decisão sobre todas as sugestões',
          params: Params,
          response: { 200: ResumeDto, 409: ProblemDetails, ...errors },
        },
      },
      async (req) => toDto(await deps.resumes.approve(actorOf(req).userId, req.params.id)),
    );

    app.get(
      '/v1/resumes/:id/export',
      {
        preHandler,
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: {
          tags,
          summary: 'Baixa o currículo aprovado em PDF ou DOCX',
          params: Params,
          querystring: ExportResumeQuery,
          response: { 409: ProblemDetails, ...errors },
        },
      },
      async (req, reply) => {
        const file = await deps.resumeExport.export(
          actorOf(req).userId,
          req.params.id,
          req.query.format,
        );
        return (
          reply
            .type(file.contentType)
            .header('content-disposition', `attachment; filename="${file.fileName}"`)
            // O corpo é binário: não passa pelos esquemas JSON da rota.
            .send(Buffer.from(file.bytes) as never)
        );
      },
    );

    app.delete(
      '/v1/resumes/:id',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Apaga um currículo',
          params: Params,
          response: { 204: z.null(), ...errors },
        },
      },
      async (req, reply) => {
        await deps.resumes.delete(actorOf(req).userId, req.params.id);
        return reply.status(204).send(null);
      },
    );
  };
