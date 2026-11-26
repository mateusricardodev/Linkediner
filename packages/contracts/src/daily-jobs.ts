import { z } from 'zod';

export const DailyPickDto = z
  .object({
    postingId: z.uuid(),
    title: z.string(),
    company: z.string(),
    location: z.string(),
    /** De onde a vaga vem: a fonte, nunca um agregador. */
    source: z.string(),
    /** Link para a página da própria empresa ou da fonte. */
    applyUrl: z.url(),
    postedAt: z.iso.datetime().nullable(),
    /** Compatibilidade com o perfil; nula quando a vaga não traz requisitos. */
    score: z.number().int().nullable(),
    explanation: z.array(z.string()),
  })
  .meta({ id: 'DailyPick' });

/** As vagas do dia (ADR 0037): seleção fixa no dia, guardada na primeira visita. */
export const DailyJobsResponse = z
  .discriminatedUnion('state', [
    /** Nenhuma fonte ligada. */
    z.object({ state: z.literal('disabled') }),
    /** As vagas encontradas fazem parte dos planos pagos. */
    z.object({ state: z.literal('upgrade_required') }),
    z.object({ state: z.literal('needs_goal'), lastSyncedAt: z.iso.datetime().nullable() }),
    z.object({
      state: z.literal('ready'),
      /** Dia da seleção (AAAA-MM-DD, UTC). */
      day: z.string(),
      goal: z.object({ id: z.uuid(), title: z.string() }),
      picks: z.array(DailyPickDto),
      lastSyncedAt: z.iso.datetime().nullable(),
      /** Sempre exibido junto da compatibilidade: ela não indica chance de contratação. */
      disclaimer: z.string(),
    }),
  ])
  .meta({ id: 'DailyJobsResponse' });
