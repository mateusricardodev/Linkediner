import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CareerGoalDto,
  CreateCareerGoalBody,
  DecideFactBody,
  ProblemDetails,
  ProfileDto,
  ProfileFactDto,
  ReplaceLinksBody,
  UpdateCareerGoalBody,
  UpdateProfileBody,
} from '@linkediner/contracts';
import type { ConsentService } from '@linkediner/core/privacy';
import type {
  CareerGoal,
  FactService,
  ProfileFact,
  ProfileService,
} from '@linkediner/core/profile';
import { actorOf, requireActor } from '../plugins/auth';
import { requireConsents } from '../plugins/require-consents';

export interface ProfileDeps {
  profile: ProfileService;
  facts: FactService;
  consents: Pick<ConsentService, 'status'>;
}

const toGoalDto = (g: CareerGoal) => ({ ...g, createdAt: g.createdAt.toISOString() });
const errors = { 400: ProblemDetails, 401: ProblemDetails, 403: ProblemDetails };
const GoalParams = z.object({ id: z.uuid() });
const toFactDto = (f: ProfileFact) => ({ ...f, createdAt: f.createdAt.toISOString() });

/** Perfil profissional e objetivos de carreira (M-02). Exige login e termos/privacidade aceitos. */
export const profileRoutes =
  (deps: ProfileDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = [requireActor, requireConsents(deps.consents)];
    const tags = ['perfil'];

    app.get(
      '/v1/profile',
      {
        preHandler,
        schema: { tags, summary: 'Perfil profissional', response: { 200: ProfileDto, ...errors } },
      },
      async (req) => deps.profile.get(actorOf(req).userId),
    );

    app.patch(
      '/v1/profile',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Atualiza o perfil',
          body: UpdateProfileBody,
          response: { 200: ProfileDto, ...errors },
        },
      },
      async (req) => {
        const { headline, summary, yearsExperience } = req.body;
        return deps.profile.update(actorOf(req).userId, {
          ...(headline !== undefined ? { headline } : {}),
          ...(summary !== undefined ? { summary } : {}),
          ...(yearsExperience !== undefined ? { yearsExperience } : {}),
        });
      },
    );

    app.get(
      '/v1/profile/facts',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Fatos do perfil, com o trecho do documento que comprova cada um',
          response: { 200: z.array(ProfileFactDto), ...errors },
        },
      },
      async (req) => (await deps.facts.list(actorOf(req).userId)).map(toFactDto),
    );

    app.patch(
      '/v1/profile/facts/:id',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Confirma, corrige ou recusa um fato',
          params: GoalParams,
          body: DecideFactBody,
          response: { 200: ProfileFactDto, 404: ProblemDetails, 409: ProblemDetails, ...errors },
        },
      },
      async (req) => {
        const { verification } = req.body;
        const decision =
          verification === 'rejected'
            ? ({ verification } as const)
            : ({ verification, ...(req.body.data ? { data: req.body.data } : {}) } as const);
        return toFactDto(await deps.facts.decide(actorOf(req).userId, req.params.id, decision));
      },
    );

    app.put(
      '/v1/profile/links',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Substitui os links profissionais',
          body: ReplaceLinksBody,
          response: { 200: ReplaceLinksBody, ...errors },
        },
      },
      async (req) => ({
        links: await deps.profile.replaceLinks(actorOf(req).userId, req.body.links),
      }),
    );

    app.get(
      '/v1/career-goals',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Lista os objetivos de carreira',
          response: { 200: z.array(CareerGoalDto), ...errors },
        },
      },
      async (req) => (await deps.profile.listGoals(actorOf(req).userId)).map(toGoalDto),
    );

    app.post(
      '/v1/career-goals',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Cria um objetivo de carreira',
          body: CreateCareerGoalBody,
          response: { 201: CareerGoalDto, 409: ProblemDetails, ...errors },
        },
      },
      async (req, reply) =>
        reply
          .status(201)
          .send(toGoalDto(await deps.profile.createGoal(actorOf(req).userId, req.body))),
    );

    app.patch(
      '/v1/career-goals/:id',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Atualiza um objetivo de carreira',
          params: GoalParams,
          body: UpdateCareerGoalBody,
          response: { 200: CareerGoalDto, 404: ProblemDetails, 409: ProblemDetails, ...errors },
        },
      },
      async (req) => {
        const patch = Object.fromEntries(
          Object.entries(req.body).filter(([, v]) => v !== undefined),
        );
        return toGoalDto(await deps.profile.updateGoal(actorOf(req).userId, req.params.id, patch));
      },
    );

    app.delete(
      '/v1/career-goals/:id',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Remove um objetivo de carreira',
          params: GoalParams,
          response: { 204: z.null(), 404: ProblemDetails, ...errors },
        },
      },
      async (req, reply) => {
        await deps.profile.deleteGoal(actorOf(req).userId, req.params.id);
        return reply.status(204).send(null);
      },
    );
  };
