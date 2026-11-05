import { z } from 'zod';

export const FactType = z
  .enum(['experience', 'skill', 'project', 'education', 'certification', 'language', 'achievement'])
  .meta({ id: 'FactType' });

export const FactVerification = z
  .enum(['extracted', 'user_confirmed', 'suggested', 'rejected'])
  .meta({ id: 'FactVerification' });

export const ProfileFactDto = z
  .object({
    id: z.uuid(),
    type: FactType,
    data: z.record(z.string(), z.string().nullable()),
    verification: FactVerification,
    sourceDocumentId: z.uuid().nullable(),
    /** Trecho do documento que comprova o fato. Fica nulo depois que o documento expira. */
    sourceSpan: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'ProfileFact' });

/** Confirmar (com correção opcional) ou recusar um fato. `data` substitui todos os campos. */
export const DecideFactBody = z
  .discriminatedUnion('verification', [
    z
      .object({
        verification: z.literal('user_confirmed'),
        data: z.record(z.string(), z.string().nullable()).optional(),
      })
      .strict(),
    z.object({ verification: z.literal('rejected') }).strict(),
  ])
  .meta({ id: 'DecideFactBody' });
