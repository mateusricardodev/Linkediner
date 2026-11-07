import { z } from 'zod';

export const DiscoveryItemDto = z
  .object({
    id: z.uuid(),
    title: z.string(),
    company: z.string(),
    location: z.string(),
    /** De onde a vaga vem: a fonte, nunca um agregador. */
    source: z.string(),
    /** Link para a página da própria empresa ou da fonte. */
    applyUrl: z.url(),
    postedAt: z.iso.datetime().nullable(),
    /** Falso enquanto a vaga aguarda análise: ainda não dá para salvar. */
    analyzed: z.boolean(),
    score: z.number().int().nullable(),
    explanation: z.array(z.string()),
  })
  .meta({ id: 'DiscoveryItem' });

export const DiscoveryResponse = z
  .discriminatedUnion('state', [
    /** Nenhuma fonte ligada. */
    z.object({ state: z.literal('disabled') }),
    z.object({ state: z.literal('needs_goal'), lastSyncedAt: z.iso.datetime().nullable() }),
    z.object({
      state: z.literal('ready'),
      goal: z.object({ id: z.uuid(), title: z.string() }),
      items: z.array(DiscoveryItemDto),
      /** Quantas vagas combinam com o objetivo, antes do limite da lista. */
      total: z.number().int(),
      lastSyncedAt: z.iso.datetime().nullable(),
      /** Sempre exibido junto da compatibilidade: ela não indica chance de contratação. */
      disclaimer: z.string(),
    }),
  ])
  .meta({ id: 'DiscoveryResponse' });
