import { z } from 'zod';

export const FACT_TYPES = [
  'experience',
  'skill',
  'project',
  'education',
  'certification',
  'language',
  'achievement',
] as const;
export type FactType = (typeof FACT_TYPES)[number];

export const FACT_VERIFICATIONS = ['extracted', 'user_confirmed', 'suggested', 'rejected'] as const;
export type FactVerification = (typeof FACT_VERIFICATIONS)[number];

const short = z.string().trim().min(1).max(300);
const long = z.string().trim().min(1).max(5000);

/**
 * Conteúdo de cada tipo de fato. Todo valor é texto, como aparece no documento: nada de datas
 * normalizadas ou campos deduzidos, o que permite conferir cada valor contra o documento original.
 */
export const FACT_DATA_SCHEMAS = {
  experience: z.object({
    company: short,
    title: short,
    startDate: short.nullable(),
    endDate: short.nullable(),
    location: short.nullable(),
    description: long.nullable(),
  }),
  skill: z.object({ name: short }),
  project: z.object({ name: short, description: long.nullable(), url: short.nullable() }),
  education: z.object({
    institution: short,
    degree: short.nullable(),
    field: short.nullable(),
    startDate: short.nullable(),
    endDate: short.nullable(),
  }),
  certification: z.object({ name: short, issuer: short.nullable(), issuedAt: short.nullable() }),
  language: z.object({ name: short, level: short.nullable() }),
  achievement: z.object({ description: long }),
} satisfies Record<FactType, z.ZodType>;

export type FactData = Record<string, string | null>;

export interface ProfileFact {
  id: string;
  type: FactType;
  data: FactData;
  sourceDocumentId: string | null;
  sourceSpan: string | null;
  verification: FactVerification;
  createdAt: Date;
}

/** Fato extraído e já comprovado contra o documento. */
export interface NewFact {
  type: FactType;
  data: FactData;
  sourceSpan: string;
}

/** Campos que identificam o mesmo fato vindo de documentos diferentes (currículo e PDF do LinkedIn). */
const FINGERPRINT_FIELDS: Record<FactType, string[]> = {
  experience: ['company', 'title', 'startDate'],
  skill: ['name'],
  project: ['name'],
  education: ['institution', 'degree'],
  certification: ['name'],
  language: ['name'],
  achievement: ['description'],
};

/** Minúsculas, sem acentos e com espaços simples: compara textos sem depender de formatação. */
export function normalizeText(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function fingerprintFact(type: FactType, data: FactData): string {
  const parts = FINGERPRINT_FIELDS[type].map((field) => normalizeText(data[field] ?? ''));
  return `${type}:${parts.join('|')}`;
}
