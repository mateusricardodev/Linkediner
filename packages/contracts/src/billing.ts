import { z } from 'zod';

export const BillingSummaryDto = z
  .object({
    plan: z.object({ key: z.string(), name: z.string() }),
    features: z.array(
      z.object({
        feature: z.string(),
        limit: z.number().int(),
        /** Nulos nas funcionalidades sim/não, que não têm contador. */
        used: z.number().int().nullable(),
        remaining: z.number().int().nullable(),
        resetsAt: z.iso.datetime().nullable(),
      }),
    ),
  })
  .meta({ id: 'BillingSummary' });

export const CheckoutBody = z
  .object({ plan: z.enum(['pro', 'advanced']) })
  .strict()
  .meta({ id: 'CheckoutBody' });

export const BillingUrlDto = z.object({ url: z.url() }).meta({ id: 'BillingUrl' });
