import { z } from 'zod';

export const DocumentKind = z.enum(['resume', 'linkedin_pdf']).meta({ id: 'DocumentKind' });
export const DocumentStatus = z
  .enum(['pending_upload', 'uploaded', 'processing', 'processed', 'failed'])
  .meta({ id: 'DocumentStatus' });

/** O caminho interno do arquivo no storage nunca é exposto. */
export const DocumentDto = z
  .object({
    id: z.uuid(),
    kind: DocumentKind,
    status: DocumentStatus,
    mimeType: z.string(),
    sizeBytes: z.number().int(),
    uploadedAt: z.iso.datetime().nullable(),
    expiresAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Document' });

export const RequestUploadBody = z
  .object({
    kind: DocumentKind,
    mimeType: z.string().max(200),
    sizeBytes: z.number().int().positive(),
  })
  .strict()
  .meta({ id: 'RequestUploadBody' });

export const RequestUploadResponse = z
  .object({
    document: DocumentDto,
    upload: z.object({
      url: z.url(),
      method: z.literal('PUT'),
      headers: z.record(z.string(), z.string()),
      expiresInSeconds: z.number().int(),
    }),
  })
  .meta({ id: 'RequestUploadResponse' });

export const DownloadResponse = z
  .object({ url: z.url(), expiresInSeconds: z.number().int() })
  .meta({ id: 'DownloadResponse' });
