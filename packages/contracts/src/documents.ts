import { z } from 'zod';

export const DocumentKind = z.enum(['resume', 'linkedin_pdf']).meta({ id: 'DocumentKind' });
export const DocumentStatus = z
  .enum(['pending_upload', 'uploaded', 'processing', 'processed', 'failed'])
  .meta({ id: 'DocumentStatus' });

/** O caminho interno do arquivo no storage nunca é exposto. */
export const FileCheckDto = z
  .object({
    version: z.string(),
    passed: z.number().int(),
    total: z.number().int(),
    checks: z.array(
      z.object({
        id: z.string(),
        ok: z.boolean(),
        label: z.string(),
        recommendation: z.string().nullable(),
      }),
    ),
  })
  .meta({ id: 'FileCheck' });

export const DocumentDto = z
  .object({
    id: z.uuid(),
    kind: DocumentKind,
    status: DocumentStatus,
    /** Motivo da falha na extração: no_text, too_long, unreadable ou processing_error. */
    failureCode: z.string().nullable(),
    /** O que a conferência da análise deixou de fora, por não estar comprovado no documento. */
    discardedFacts: z.number().int(),
    droppedFields: z.number().int(),
    /** Como um sistema de recrutamento leria o arquivo. Só para currículo. */
    fileCheck: FileCheckDto.nullable(),
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
