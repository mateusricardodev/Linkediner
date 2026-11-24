import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateLinkedinAnalysisBody,
  LinkedinAnalysisDto,
  LinkedinAnalysisSummaryDto,
  ProblemDetails,
  UpdateLinkedinActionsBody,
} from '@linkediner/contracts';
import type { LinkedinAnalysis, LinkedinAnalysisService } from '@linkediner/core/linkedin';
import type { ConsentService } from '@linkediner/core/privacy';
import { actorOf, requireActor } from '../plugins/auth';
import { requireConsents } from '../plugins/require-consents';

export interface LinkedinDeps {
  linkedin: LinkedinAnalysisService;
  consents: Pick<ConsentService, 'status'>;
}

const toSummary = (a: LinkedinAnalysis) => ({
  id: a.id,
  status: a.status,
  failureCode: a.failureCode,
  score: a.result?.score ?? null,
  targetRole: a.targetRole,
  actionsDone: a.doneActions.length,
  actionsTotal: a.result?.sections.reduce((n, s) => n + s.actions.length, 0) ?? 0,
  createdAt: a.createdAt.toISOString(),
});

const errors = {
  400: ProblemDetails,
  401: ProblemDetails,
  403: ProblemDetails,
  404: ProblemDetails,
};
const Params = z.object({ id: z.uuid() });

/** Análise do perfil do LinkedIn a partir do PDF (ADR 0034). */
export const linkedinRoutes =
  (deps: LinkedinDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = [requireActor, requireConsents(deps.consents)];
    const tags = ['linkedin'];

    app.post(
      '/v1/linkedin-analyses',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Pede a análise de um PDF do LinkedIn já enviado',
          body: CreateLinkedinAnalysisBody,
          response: {
            202: LinkedinAnalysisSummaryDto,
            409: ProblemDetails,
            429: ProblemDetails,
            ...errors,
          },
        },
      },
      async (req, reply) => {
        const analysis = await deps.linkedin.request(actorOf(req).userId, req.body.documentId);
        return reply.code(202).send(toSummary(analysis));
      },
    );

    app.get(
      '/v1/linkedin-analyses',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Análises do LinkedIn, da mais nova para a mais antiga',
          response: { 200: z.array(LinkedinAnalysisSummaryDto), ...errors },
        },
      },
      async (req) => (await deps.linkedin.list(actorOf(req).userId)).map(toSummary),
    );

    app.get(
      '/v1/linkedin-analyses/:id',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Uma análise com o resultado completo',
          params: Params,
          response: { 200: LinkedinAnalysisDto, ...errors },
        },
      },
      async (req) => {
        const analysis = await deps.linkedin.get(actorOf(req).userId, req.params.id);
        return {
          ...toSummary(analysis),
          documentId: analysis.documentId,
          result: analysis.result,
          doneActions: analysis.doneActions,
          rewritesLocked: analysis.rewritesLocked,
        };
      },
    );

    app.put(
      '/v1/linkedin-analyses/:id/actions',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Guarda as ações do checklist marcadas como feitas',
          params: Params,
          body: UpdateLinkedinActionsBody,
          response: { 200: UpdateLinkedinActionsBody, 409: ProblemDetails, ...errors },
        },
      },
      async (req) => ({
        doneActions: await deps.linkedin.setDoneActions(
          actorOf(req).userId,
          req.params.id,
          req.body.doneActions,
        ),
      }),
    );
  };
