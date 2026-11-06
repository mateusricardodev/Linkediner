import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ImportJobBody,
  JobDto,
  JobFeedbackBody,
  JobFeedbackResponse,
  JobMatchQuery,
  JobMatchResponse,
  ProblemDetails,
  RecommendationsResponse,
} from '@linkediner/contracts';
import type { ProductEvents } from '@linkediner/core/analytics';
import type { Job, JobService } from '@linkediner/core/jobs';
import {
  MATCH_DISCLAIMER,
  type FeedbackService,
  type MatchingService,
} from '@linkediner/core/matching';
import type { ConsentService } from '@linkediner/core/privacy';
import { actorOf, requireActor } from '../plugins/auth';
import { requireConsents } from '../plugins/require-consents';

export interface JobDeps {
  jobs: JobService;
  matching: Pick<MatchingService, 'forJob'>;
  feedback: FeedbackService;
  consents: Pick<ConsentService, 'status'>;
  events: Pick<ProductEvents, 'track'>;
}

const toDto = (j: Job) => ({ ...j, createdAt: j.createdAt.toISOString() });
const errors = {
  400: ProblemDetails,
  401: ProblemDetails,
  403: ProblemDetails,
  404: ProblemDetails,
};
const Params = z.object({ id: z.uuid() });

/** Importação manual de vagas (M-09), compatibilidade (M-10), feedback e recomendações (M-11). */
export const jobRoutes =
  (deps: JobDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = [requireActor, requireConsents(deps.consents)];
    const tags = ['vagas'];

    app.post(
      '/v1/jobs/import',
      {
        preHandler,
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: {
          tags,
          summary: 'Importa uma vaga a partir do texto colado. O link nunca é acessado',
          body: ImportJobBody,
          response: { 202: JobDto, 503: ProblemDetails, ...errors },
        },
      },
      async (req, reply) =>
        reply.status(202).send(toDto(await deps.jobs.import(actorOf(req).userId, req.body))),
    );

    app.get(
      '/v1/jobs',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Lista as vagas importadas',
          response: { 200: z.array(JobDto), ...errors },
        },
      },
      async (req) => (await deps.jobs.list(actorOf(req).userId)).map(toDto),
    );

    app.get(
      '/v1/jobs/:id',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Detalhe de uma vaga',
          params: Params,
          response: { 200: JobDto, ...errors },
        },
      },
      async (req) => {
        const { userId } = actorOf(req);
        const job = await deps.jobs.get(userId, req.params.id);
        // Cada vaga conta uma vez: rever a mesma vaga não muda o funil.
        await deps.events.track(userId, [{ name: 'job_viewed', dedupeKey: `viewed:${job.id}` }]);
        return toDto(job);
      },
    );

    app.get(
      '/v1/jobs/recommendations',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Vagas ordenadas pela compatibilidade e pelas suas avaliações',
          querystring: JobMatchQuery,
          response: { 200: RecommendationsResponse, ...errors },
        },
      },
      async (req) => {
        const { userId } = actorOf(req);
        const { items, hidden } = await deps.feedback.recommendations(userId, req.query.goalId);
        await deps.events.track(
          userId,
          items.map((item) => ({
            name: 'job_recommended' as const,
            dedupeKey: `recommended:${item.job.id}`,
          })),
        );
        return {
          items: items.map((item) => ({ ...item, job: toDto(item.job) })),
          hidden,
          disclaimer: MATCH_DISCLAIMER,
        };
      },
    );

    app.get(
      '/v1/jobs/:id/feedback',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Sua avaliação da vaga',
          params: Params,
          response: { 200: JobFeedbackResponse, 409: ProblemDetails, ...errors },
        },
      },
      async (req) => ({
        reasons: await deps.feedback.forJob(actorOf(req).userId, req.params.id),
      }),
    );

    app.put(
      '/v1/jobs/:id/feedback',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Avalia a vaga. A lista substitui a anterior, e lista vazia limpa',
          params: Params,
          body: JobFeedbackBody,
          response: { 200: JobFeedbackResponse, 409: ProblemDetails, ...errors },
        },
      },
      async (req) => ({
        reasons: await deps.feedback.set(actorOf(req).userId, req.params.id, req.body.reasons),
      }),
    );

    app.get(
      '/v1/jobs/:id/match',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Compatibilidade entre o perfil e a vaga, requisito por requisito',
          params: Params,
          querystring: JobMatchQuery,
          response: { 200: JobMatchResponse, 409: ProblemDetails, ...errors },
        },
      },
      async (req) => {
        const match = await deps.matching.forJob(
          actorOf(req).userId,
          req.params.id,
          req.query.goalId,
        );
        return {
          jobId: match.jobId,
          careerGoalId: match.careerGoalId,
          ...match.result,
          calculatedAt: match.calculatedAt.toISOString(),
          disclaimer: MATCH_DISCLAIMER,
        };
      },
    );

    app.delete(
      '/v1/jobs/:id',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Apaga uma vaga',
          params: Params,
          response: { 204: z.null(), ...errors },
        },
      },
      async (req, reply) => {
        await deps.jobs.delete(actorOf(req).userId, req.params.id);
        return reply.status(204).send(null);
      },
    );
  };
