import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { DiscoveryResponse, JobDto, JobMatchQuery, ProblemDetails } from '@linkediner/contracts';
import type { ProductEvents } from '@linkediner/core/analytics';
import type { DiscoveryService } from '@linkediner/core/discovery';
import { MATCH_DISCLAIMER } from '@linkediner/core/matching';
import type { ConsentService } from '@linkediner/core/privacy';
import { actorOf, requireActor } from '../plugins/auth';
import { requireConsents } from '../plugins/require-consents';

export interface DiscoveryDeps {
  discovery: DiscoveryService;
  consents: Pick<ConsentService, 'status'>;
  events: Pick<ProductEvents, 'track'>;
}

const errors = {
  400: ProblemDetails,
  401: ProblemDetails,
  403: ProblemDetails,
  404: ProblemDetails,
};
const iso = (date: Date | null) => date?.toISOString() ?? null;

/** Vagas encontradas nas fontes autorizadas, de acordo com o objetivo (ADR 0024). */
export const discoveryRoutes =
  (deps: DiscoveryDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = [requireActor, requireConsents(deps.consents)];
    const tags = ['vagas'];

    app.get(
      '/v1/discovery',
      {
        preHandler,
        schema: {
          tags,
          summary:
            'Vagas das fontes autorizadas para um objetivo, das mais recentes às mais antigas',
          querystring: JobMatchQuery,
          response: { 200: DiscoveryResponse, ...errors },
        },
      },
      async (req) => {
        const { userId } = actorOf(req);
        const feed = await deps.discovery.feed(userId, req.query.goalId);
        if (feed.state === 'disabled' || feed.state === 'upgrade_required') return feed;
        if (feed.state === 'needs_goal') {
          return { state: feed.state, lastSyncedAt: iso(feed.lastSyncedAt) };
        }
        await deps.events.track(
          userId,
          feed.items.map(({ posting }) => ({
            name: 'job_recommended' as const,
            dedupeKey: `descoberta:${posting.id}`,
          })),
        );
        return {
          state: feed.state,
          goal: feed.goal,
          total: feed.total,
          lastSyncedAt: iso(feed.lastSyncedAt),
          disclaimer: MATCH_DISCLAIMER,
          items: feed.items.map(({ posting, score, explanation }) => ({
            id: posting.id,
            title: posting.title,
            company: posting.company,
            location: posting.location,
            source: posting.sourceKey,
            applyUrl: posting.applyUrl,
            postedAt: iso(posting.postedAt),
            analyzed: posting.structured,
            score,
            explanation,
          })),
        };
      },
    );

    app.post(
      '/v1/discovery/:id/save',
      {
        preHandler,
        schema: {
          tags,
          summary: 'Salva a vaga entre as suas. Salvar de novo devolve a mesma',
          params: z.object({ id: z.uuid() }),
          response: { 200: JobDto, 409: ProblemDetails, ...errors },
        },
      },
      async (req) => {
        const job = await deps.discovery.save(actorOf(req).userId, req.params.id);
        return { ...job, createdAt: job.createdAt.toISOString() };
      },
    );
  };
