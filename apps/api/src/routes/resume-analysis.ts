import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateResumeAnalysisBody,
  ResumeAnalysisDto,
  ResumeAnalysisSummaryDto,
  ProblemDetails,
  UpdateResumeAnalysisActionsBody,
} from '@linkediner/contracts';
import type { ResumeAnalysis, ResumeAnalysisService } from '@linkediner/core/resume-analysis';
import type { ConsentService } from '@linkediner/core/privacy';
import { actorOf, requireActor } from '../plugins/auth';
import { requireConsents } from '../plugins/require-consents';

export interface ResumeAnalysisDeps {
  resumeAnalysis: ResumeAnalysisService;
  consents: Pick<ConsentService, 'status'>;
}

const toSummary = (a: ResumeAnalysis) => ({
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

/** Análise do currículo enviado: conferência ATS e avaliação por IA (ADR 0035). */
export const resumeAnalysisRoutes =
  (deps: ResumeAnalysisDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = [requireActor, requireConsents(deps.consents)];
    const tags = ['resume-analysis'];

    app.post(
      '/v1/resume-analyses',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Pede a análise de um currículo já enviado',
          body: CreateResumeAnalysisBody,
          response: {
            202: ResumeAnalysisSummaryDto,
            409: ProblemDetails,
            429: ProblemDetails,
            ...errors,
          },
        },
      },
      async (req, reply) => {
        const analysis = await deps.resumeAnalysis.request(
          actorOf(req).userId,
          req.body.documentId,
        );
        return reply.code(202).send(toSummary(analysis));
      },
    );

    app.get(
      '/v1/resume-analyses',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Análises de currículo, da mais nova para a mais antiga',
          response: { 200: z.array(ResumeAnalysisSummaryDto), ...errors },
        },
      },
      async (req) => (await deps.resumeAnalysis.list(actorOf(req).userId)).map(toSummary),
    );

    app.get(
      '/v1/resume-analyses/:id',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Uma análise com o resultado completo',
          params: Params,
          response: { 200: ResumeAnalysisDto, ...errors },
        },
      },
      async (req) => {
        const analysis = await deps.resumeAnalysis.get(actorOf(req).userId, req.params.id);
        return {
          ...toSummary(analysis),
          documentId: analysis.documentId,
          result: analysis.result,
          doneActions: analysis.doneActions,
        };
      },
    );

    app.put(
      '/v1/resume-analyses/:id/actions',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Guarda as ações do checklist marcadas como feitas',
          params: Params,
          body: UpdateResumeAnalysisActionsBody,
          response: { 200: UpdateResumeAnalysisActionsBody, 409: ProblemDetails, ...errors },
        },
      },
      async (req) => ({
        doneActions: await deps.resumeAnalysis.setDoneActions(
          actorOf(req).userId,
          req.params.id,
          req.body.doneActions,
        ),
      }),
    );
  };
