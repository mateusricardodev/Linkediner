import { z } from 'zod';
import { Seniority } from './profile';

export const JobStatus = z.enum(['structuring', 'ready', 'failed']).meta({ id: 'JobStatus' });
export const RemotePolicy = z
  .enum(['remote', 'hybrid', 'onsite', 'unknown'])
  .meta({ id: 'RemotePolicy' });

export const JobDto = z
  .object({
    id: z.uuid(),
    source: z.string(),
    status: JobStatus,
    /** Motivo da falha: consent_revoked ou processing_error. */
    failureCode: z.string().nullable(),
    rawText: z.string(),
    /** Só uma referência para o usuário abrir. O sistema nunca acessa este link. */
    applyUrl: z.string().nullable(),
    title: z.string().nullable(),
    company: z.string().nullable(),
    location: z.string().nullable(),
    employmentType: z.string().nullable(),
    salaryText: z.string().nullable(),
    remotePolicy: RemotePolicy.nullable(),
    seniority: Seniority.nullable(),
    mustHave: z.array(z.string()),
    niceToHave: z.array(z.string()),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Job' });

export const ImportJobBody = z
  .object({
    text: z.string().max(40_000),
    applyUrl: z.string().max(2000).optional(),
  })
  .strict()
  .meta({ id: 'ImportJobBody' });
