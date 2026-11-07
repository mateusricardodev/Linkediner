import { z } from 'zod';

export const ConsentPurpose = z
  .enum(['terms', 'privacy', 'ai_processing', 'auto_apply', 'marketing', 'model_training'])
  .meta({ id: 'ConsentPurpose' });

export const ConsentStatusDto = z
  .object({
    granted: z.record(ConsentPurpose, z.boolean()),
    missingRequired: z.array(ConsentPurpose),
    versions: z.record(ConsentPurpose, z.string()),
  })
  .meta({ id: 'ConsentStatus' });

export const MeResponse = z
  .object({
    user: z.object({
      id: z.uuid(),
      email: z.email(),
      name: z.string().nullable(),
      locale: z.string(),
    }),
    consents: ConsentStatusDto,
    /** Verdadeiro quando a IA está num plano em que o conteúdo enviado pode ser usado pelo provedor. */
    syntheticDataOnly: z.boolean(),
  })
  .meta({ id: 'MeResponse' });

export const UpdateConsentBody = z
  .object({ granted: z.boolean() })
  .meta({ id: 'UpdateConsentBody' });

export type MeResponse = z.infer<typeof MeResponse>;
