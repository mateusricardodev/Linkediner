import { z } from 'zod';
import { EVENT_RETENTION_DAYS } from '@linkediner/core/analytics';
import { defineTask } from '../task';

/** Apaga os eventos de produto mais antigos que a retenção (ADR 0022). */
export const analyticsExpireEvents = (deps: {
  events: { deleteOlderThan(cutoff: Date): Promise<number> };
  now?: () => Date;
}) =>
  defineTask({
    name: 'analytics.expire_events',
    payload: z.object({}).strict(),
    retryLimit: 3,
    expireInSeconds: 10 * 60,
    cron: '53 3 * * *',
    async handle(_payload, ctx) {
      const now = (deps.now ?? (() => new Date()))();
      const cutoff = new Date(now.getTime() - EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const deleted = await deps.events.deleteOlderThan(cutoff);
      ctx.logger.info({ deleted }, 'eventos de produto expirados removidos');
    },
  });
