import { createHash } from 'node:crypto';
import { z } from 'zod';
import { normalizeLink, normalizeText, SENIORITIES, type Seniority } from '../../profile';
import { AppError } from '../../shared';

export const JOBS_STRUCTURE_QUEUE = {
  name: 'jobs.structure',
  deadLetter: 'jobs.structure.dead',
  retryLimit: 2,
  expireInSeconds: 5 * 60,
} as const;

export interface StructureJobPayload {
  userId: string;
  jobId: string;
}

export const JOB_FAILURES = {
  consentRevoked: 'consent_revoked',
  processingError: 'processing_error',
} as const;

export const JOB_TEXT_LIMITS = { minChars: 50, maxChars: 30_000 } as const;

export type JobStatus = 'structuring' | 'ready' | 'failed';
export const REMOTE_POLICIES = ['remote', 'hybrid', 'onsite', 'unknown'] as const;
export type RemotePolicy = (typeof REMOTE_POLICIES)[number];

export interface JobFields {
  title: string | null;
  company: string | null;
  location: string | null;
  employmentType: string | null;
  salaryText: string | null;
  remotePolicy: RemotePolicy | null;
  seniority: Seniority | null;
  mustHave: string[];
  niceToHave: string[];
}

export interface Job extends JobFields {
  id: string;
  source: string;
  status: JobStatus;
  failureCode: string | null;
  rawText: string;
  applyUrl: string | null;
  createdAt: Date;
}

export interface NewJob {
  id: string;
  rawText: string;
  applyUrl: string | null;
  dedupeHash: string;
}

const value = z.string().trim().min(1).max(500).nullable();
const requirements = z.array(z.string().trim().min(1).max(500)).max(100);

/** Formato pedido à IA. */
export const JobOutput = z.object({
  title: value,
  company: value,
  location: value,
  employmentType: value,
  salaryText: value,
  remotePolicy: z.enum(REMOTE_POLICIES),
  seniority: z.enum([...SENIORITIES, 'unknown']),
  mustHave: requirements,
  niceToHave: requirements,
});
export type JobOutput = z.infer<typeof JobOutput>;

export const EMPTY_JOB_OUTPUT: JobOutput = {
  title: null,
  company: null,
  location: null,
  employmentType: null,
  salaryText: null,
  remotePolicy: 'unknown',
  seniority: 'unknown',
  mustHave: [],
  niceToHave: [],
};

/** Mesmo texto, mesma vaga: não importa a capitalização nem os espaços. */
export function jobDedupeHash(text: string): string {
  return createHash('sha256').update(normalizeText(text)).digest('hex');
}

export function validateJobImport(input: { text: string; applyUrl?: string | undefined }): {
  text: string;
  applyUrl: string | null;
} {
  const text = input.text.trim();
  if (text.length < JOB_TEXT_LIMITS.minChars) {
    throw new AppError('VALIDATION_FAILED', 'Cole o texto completo da vaga.', { field: 'text' });
  }
  if (text.length > JOB_TEXT_LIMITS.maxChars) {
    throw new AppError('VALIDATION_FAILED', 'O texto da vaga é longo demais.', { field: 'text' });
  }
  // A mesma validação dos links do perfil: HTTPS e sem endereços locais. O link nunca é acessado.
  const applyUrl = input.applyUrl ? normalizeLink('other', input.applyUrl).url : null;
  return { text, applyUrl };
}

export interface JobGroundingReport {
  discardedValues: number;
  discardedRequirements: number;
}

/**
 * Regra anti-invenção: todo valor copiado da vaga precisa existir no texto.
 * O que não existe é descartado. Senioridade e modelo de trabalho são classificações, não cópias.
 */
export function groundJob(
  output: JobOutput,
  jobText: string,
): { fields: JobFields; report: JobGroundingReport } {
  const source = normalizeText(jobText);
  const report: JobGroundingReport = { discardedValues: 0, discardedRequirements: 0 };
  const inText = (text: string) => source.includes(normalizeText(text));

  const keep = (text: string | null) => {
    if (text === null) return null;
    if (inText(text)) return text;
    report.discardedValues++;
    return null;
  };
  const keepList = (list: string[]) =>
    list.filter((item) => {
      const found = inText(item);
      if (!found) report.discardedRequirements++;
      return found;
    });

  return {
    report,
    fields: {
      title: keep(output.title),
      company: keep(output.company),
      location: keep(output.location),
      employmentType: keep(output.employmentType),
      salaryText: keep(output.salaryText),
      remotePolicy: output.remotePolicy,
      seniority: output.seniority === 'unknown' ? null : output.seniority,
      mustHave: keepList(output.mustHave),
      niceToHave: keepList(output.niceToHave),
    },
  };
}
