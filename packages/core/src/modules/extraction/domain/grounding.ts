import { z } from 'zod';
import {
  FACT_DATA_SCHEMAS,
  normalizeText,
  type FactData,
  type FactType,
  type NewFact,
} from '../../profile';

const withSpan = <T extends z.ZodObject>(schema: T) =>
  schema.extend({ sourceSpan: z.string().trim().min(1).max(2000) });
const list = <T extends z.ZodObject>(schema: T) => z.array(withSpan(schema)).max(200);

/** Formato pedido à IA. Listas por tipo, com o trecho do documento que comprova cada item. */
export const ExtractionOutput = z.object({
  experiences: list(FACT_DATA_SCHEMAS.experience),
  skills: list(FACT_DATA_SCHEMAS.skill),
  projects: list(FACT_DATA_SCHEMAS.project),
  education: list(FACT_DATA_SCHEMAS.education),
  certifications: list(FACT_DATA_SCHEMAS.certification),
  languages: list(FACT_DATA_SCHEMAS.language),
  achievements: list(FACT_DATA_SCHEMAS.achievement),
});
export type ExtractionOutput = z.infer<typeof ExtractionOutput>;

export const EMPTY_EXTRACTION: ExtractionOutput = {
  experiences: [],
  skills: [],
  projects: [],
  education: [],
  certifications: [],
  languages: [],
  achievements: [],
};

const TYPE_BY_KEY: Record<keyof ExtractionOutput, FactType> = {
  experiences: 'experience',
  skills: 'skill',
  projects: 'project',
  education: 'education',
  certifications: 'certification',
  languages: 'language',
  achievements: 'achievement',
};

export interface GroundingReport {
  accepted: number;
  rejectedNoSource: number;
  rejectedUnsupportedValue: number;
}

/**
 * Regra anti-invenção, aplicada em código e não só pedida no prompt:
 * o trecho citado precisa existir no documento, e todo valor do fato também.
 * Fato que não passa é descartado. Só os resultados agregados são registrados, sem conteúdo.
 */
export function groundFacts(
  output: ExtractionOutput,
  documentText: string,
): { facts: NewFact[]; report: GroundingReport } {
  const source = normalizeText(documentText);
  const facts: NewFact[] = [];
  const report: GroundingReport = { accepted: 0, rejectedNoSource: 0, rejectedUnsupportedValue: 0 };

  for (const key of Object.keys(TYPE_BY_KEY) as (keyof ExtractionOutput)[]) {
    for (const item of output[key]) {
      const { sourceSpan, ...data } = item as FactData & { sourceSpan: string };
      if (!source.includes(normalizeText(sourceSpan))) {
        report.rejectedNoSource++;
        continue;
      }
      const supported = Object.values(data).every(
        (value) => value === null || source.includes(normalizeText(value)),
      );
      if (!supported) {
        report.rejectedUnsupportedValue++;
        continue;
      }
      facts.push({ type: TYPE_BY_KEY[key], data, sourceSpan });
      report.accepted++;
    }
  }
  return { facts, report };
}
