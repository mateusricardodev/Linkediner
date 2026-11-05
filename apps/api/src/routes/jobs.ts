import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ImportJobBody, JobDto, ProblemDetails } from '@linkediner/contracts';
import type { Job, JobService } from '@linkediner/core/jobs';
import type { ConsentService } from '@linkediner/core/privacy';
import { actorOf, requireActor } from '../plugins/auth';
import { requireConsents } from '../plugins/require-consents';

export interface JobDeps {
  jobs: JobService;
  consents: Pick<ConsentService, 'status'>;
}

const toDto = (j: Job) => ({ ...j, createdAt: j.createdAt.toISOString() });
const errors = {
  400: ProblemDetails,
  401: ProblemDetails,
  403: ProblemDetails,
  404: ProblemDetails,
};
const Params = z.object({ id: z.uuid() });

/** Importação manual de vagas (M-09). */
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
      async (req) => toDto(await deps.jobs.get(actorOf(req).userId, req.params.id)),
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
