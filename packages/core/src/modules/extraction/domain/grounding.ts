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

const headerValue = z.string().trim().min(1).max(3000).nullable();

/** Cabeçalho do perfil: título, "Sobre", localização e setor, copiados como estão no documento. */
export const ProfileHeaderOutput = z.object({
  headline: headerValue,
  about: headerValue,
  location: headerValue,
  industry: headerValue,
});
export type ProfileHeaderOutput = z.infer<typeof ProfileHeaderOutput>;

/** Formato pedido à IA. Listas por tipo, com o trecho do documento que comprova cada item. */
export const ExtractionOutput = z.object({
  /** Opcional: respostas da versão 1 do prompt não trazem o cabeçalho. */
  profile: ProfileHeaderOutput.optional(),
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

const TYPE_BY_KEY: Record<Exclude<keyof ExtractionOutput, 'profile'>, FactType> = {
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
  /** Campos opcionais sem comprovação: o fato fica, sem eles. */
  droppedFields: number;
}

/** Abaixo disso, um pedaço pode existir no documento por acaso, e juntá-los criaria outra frase. */
const MIN_FRAGMENT_CHARS = 12;

/**
 * O valor precisa estar no documento. Um texto longo pode juntar tópicos separados, sem os marcadores
 * que havia entre eles: nesse caso, cada frase precisa estar lá, com tamanho para não ser coincidência.
 */
function isSupported(source: string, value: string): boolean {
  if (source.includes(normalizeText(value))) return true;
  const fragments = value
    .split(/\n+|(?<=[.!?;])\s+/)
    .map((fragment) => normalizeText(fragment.replace(/^\s*[•·*-]\s*/, '')))
    .filter(Boolean);
  return (
    fragments.length > 1 &&
    fragments.every(
      (fragment) => fragment.length >= MIN_FRAGMENT_CHARS && source.includes(fragment),
    )
  );
}

/**
 * Regra anti-invenção, aplicada em código e não só pedida no prompt:
 * o trecho citado precisa existir no documento, e todo valor gravado também.
 * Valor opcional sem comprovação é apagado, e o fato fica sem ele. Sem trecho ou sem um valor
 * obrigatório, como empresa e cargo, o fato é descartado. Nenhum valor sem comprovação é gravado.
 * Só os resultados agregados são registrados, sem conteúdo.
 */
export function groundFacts(
  output: ExtractionOutput,
  documentText: string,
): { facts: NewFact[]; report: GroundingReport } {
  const source = normalizeText(documentText);
  const facts: NewFact[] = [];
  const report: GroundingReport = {
    accepted: 0,
    rejectedNoSource: 0,
    rejectedUnsupportedValue: 0,
    droppedFields: 0,
  };

  for (const key of Object.keys(TYPE_BY_KEY) as (keyof typeof TYPE_BY_KEY)[]) {
    for (const item of output[key]) {
      const { sourceSpan, ...values } = item as FactData & { sourceSpan: string };
      if (!source.includes(normalizeText(sourceSpan))) {
        report.rejectedNoSource++;
        continue;
      }
      let dropped = 0;
      const data: FactData = {};
      for (const [field, value] of Object.entries(values)) {
        const supported = value === null || isSupported(source, value);
        if (!supported) dropped++;
        data[field] = supported ? value : null;
      }
      // O esquema diz o que é obrigatório: sem esses campos, o fato não existe.
      const type = TYPE_BY_KEY[key];
      if (!FACT_DATA_SCHEMAS[type].safeParse(data).success) {
        report.rejectedUnsupportedValue++;
        continue;
      }
      report.droppedFields += dropped;
      facts.push({ type, data, sourceSpan });
      report.accepted++;
    }
  }
  return { facts, report };
}

/** Campos do perfil que a extração pode preencher, com o nome usado no perfil. */
export interface GroundedHeader {
  headline: string | null;
  summary: string | null;
  location: string | null;
  industry: string | null;
}

/**
 * A mesma regra dos fatos vale para o cabeçalho: só entra o valor que está escrito no documento.
 * O que não estiver comprovado vira null e não preenche nada.
 */
export function groundHeader(
  output: ExtractionOutput,
  documentText: string,
): { header: GroundedHeader; dropped: number } {
  const source = normalizeText(documentText);
  const header: GroundedHeader = { headline: null, summary: null, location: null, industry: null };
  let dropped = 0;
  const values = output.profile;
  if (!values) return { header, dropped };
  const pairs: [keyof GroundedHeader, string | null][] = [
    ['headline', values.headline],
    ['summary', values.about],
    ['location', values.location],
    ['industry', values.industry],
  ];
  for (const [field, value] of pairs) {
    if (value === null) continue;
    if (isSupported(source, value)) header[field] = value;
    else dropped++;
  }
  return { header, dropped };
}
