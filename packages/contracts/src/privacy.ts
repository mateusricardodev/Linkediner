import { z } from 'zod';

export const DeleteAccountBody = z
  .object({
    /** A pessoa digita o próprio e-mail para confirmar. A exclusão não pode ser desfeita. */
    confirmEmail: z.string().trim().min(1).max(320),
  })
  .strict()
  .meta({ id: 'DeleteAccountBody' });

export const DeletionAcceptedDto = z
  .object({ status: z.enum(['pending', 'failed']) })
  .meta({ id: 'DeletionAccepted' });

export const DataExportDto = z
  .object({
    id: z.uuid(),
    status: z.enum(['pending', 'ready', 'failed']),
    sizeBytes: z.number().int().nullable(),
    /** URL de curta duração, gerada a cada consulta. Nula até o arquivo ficar pronto. */
    downloadUrl: z.url().nullable(),
    expiresAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'DataExport' });
