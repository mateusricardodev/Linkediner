import { z } from 'zod';
import { AppError } from '../../shared';

/** Partes do perfil analisadas, na ordem em que aparecem na tela. */
export const SECTION_KEYS = [
  'headline',
  'about',
  'experience',
  'skills',
  'education',
  'completeness',
  'keywords',
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/**
 * Peso de cada parte na nota geral. A soma é 100. A nota geral é calculada aqui, não pela IA:
 * assim ela sempre bate com as notas das seções que a pessoa vê.
 */
export const SECTION_WEIGHTS: Record<SectionKey, number> = {
  headline: 15,
  about: 15,
  experience: 25,
  skills: 15,
  education: 10,
  completeness: 10,
  keywords: 10,
};

/** Seções com texto pronto para colar. As demais são listas ou dados, sem um texto único. */
export const REWRITABLE: ReadonlySet<SectionKey> = new Set(['headline', 'about', 'experience']);

export const LINKEDIN_ANALYSIS_STATUSES = ['processing', 'ready', 'failed'] as const;
export type LinkedinAnalysisStatus = (typeof LINKEDIN_ANALYSIS_STATUSES)[number];

export const LINKEDIN_ANALYZE_QUEUE = {
  name: 'linkedin.analyze',
  deadLetter: 'linkedin.analyze.dead',
  /**
   * O provedor de IA fica sobrecarregado por até dezenas de minutos: as tentativas se espaçam
   * (20 s, 40 s, 80 s... até cerca de 10 min), somando uns 20 minutos antes de desistir.
   */
  retryLimit: 6,
  retryDelay: 20,
  expireInSeconds: 5 * 60,
} as const;

export interface AnalyzeLinkedinJob {
  userId: string;
  analysisId: string;
}

export const LINKEDIN_ANALYSIS_FAILURES = {
  documentMissing: 'document_missing',
  unreadable: 'unreadable',
  noText: 'no_text',
  consentRevoked: 'consent_revoked',
  processingError: 'processing_error',
} as const;

export const analysisUsageKey = (analysisId: string) => `linkedin-analysis:${analysisId}`;

const text = (max: number) => z.string().trim().min(1).max(max);

/** Formato pedido à IA. Listas com teto: a tela mostra tudo, sem paginação. */
export const AnalysisOutput = z.object({
  strengths: z.array(text(300)).max(6),
  improvements: z.array(text(300)).max(6),
  missingKeywords: z.array(text(60)).max(10),
  competitivePosition: text(1500),
  sections: z
    .array(
      z.object({
        key: z.enum(SECTION_KEYS),
        score: z.number().int().min(0).max(100),
        analysis: text(1500),
        breakdown: z
          .array(
            z.object({
              criterion: text(120),
              points: z.number().int().min(0).max(100),
              max: z.number().int().min(1).max(100),
            }),
          )
          .max(6),
        tip: text(300).nullable(),
        rewrite: text(2600).nullable(),
        actions: z.array(text(300)).max(4),
      }),
    )
    .max(SECTION_KEYS.length),
});
export type AnalysisOutput = z.infer<typeof AnalysisOutput>;

export interface AnalysisAction {
  /** Estável dentro da análise: é o que fica salvo quando a pessoa marca como feito. */
  id: string;
  text: string;
}

export interface AnalysisSection {
  key: SectionKey;
  score: number;
  analysis: string;
  breakdown: { criterion: string; points: number; max: number }[];
  tip: string | null;
  /** Texto pronto para colar no LinkedIn. Só existe se passou na conferência. */
  rewrite: string | null;
  actions: AnalysisAction[];
}

export interface AnalysisResult {
  score: number;
  strengths: string[];
  improvements: string[];
  missingKeywords: string[];
  competitivePosition: string;
  sections: AnalysisSection[];
}

export interface LinkedinAnalysis {
  id: string;
  documentId: string | null;
  status: LinkedinAnalysisStatus;
  failureCode: string | null;
  /** Cargo usado como alvo das palavras-chave (do objetivo ativo). */
  targetRole: string | null;
  result: AnalysisResult | null;
  doneActions: string[];
  createdAt: Date;
}

/** Números escritos no texto, como "40%", "2.500" ou "3". */
const NUMBER = /\d+(?:[.,]\d+)*/g;
const digits = (value: string) => value.replace(/\D/g, '');

/**
 * Regra anti-invenção para o texto pronto (ADR 0012): ele pode reescrever, mas não pode trazer um
 * número que não está no perfil. Resultado inventado é o erro mais grave num currículo.
 */
export function unsupportedNumbers(rewrite: string, source: string): string[] {
  const available = new Set((source.match(NUMBER) ?? []).map(digits));
  return [...new Set(rewrite.match(NUMBER) ?? [])].filter((n) => !available.has(digits(n)));
}

/**
 * Monta o resultado guardado: uma seção por parte (a última vence se a IA repetir), nota geral
 * calculada pelos pesos, ids estáveis para as ações e texto pronto só quando comprovado.
 * Devolve também quantos textos prontos foram descartados, para o registro da geração.
 */
export function buildResult(
  output: AnalysisOutput,
  source: string,
): { result: AnalysisResult; droppedRewrites: number } {
  const byKey = new Map(output.sections.map((section) => [section.key, section]));
  let droppedRewrites = 0;
  const sections: AnalysisSection[] = SECTION_KEYS.filter((key) => byKey.has(key)).map((key) => {
    const section = byKey.get(key)!;
    let rewrite = REWRITABLE.has(key) ? section.rewrite : null;
    if (rewrite && unsupportedNumbers(rewrite, source).length > 0) {
      droppedRewrites++;
      rewrite = null;
    }
    return {
      key,
      score: section.score,
      analysis: section.analysis,
      breakdown: section.breakdown.map((item) => ({
        ...item,
        points: Math.min(item.points, item.max),
      })),
      tip: section.tip,
      rewrite,
      actions: section.actions.map((action, index) => ({
        id: `${key}-${index + 1}`,
        text: action,
      })),
    };
  });
  const weight = sections.reduce((sum, s) => sum + SECTION_WEIGHTS[s.key], 0);
  const score =
    weight === 0
      ? 0
      : Math.round(sections.reduce((sum, s) => sum + s.score * SECTION_WEIGHTS[s.key], 0) / weight);
  return {
    result: {
      score,
      strengths: output.strengths,
      improvements: output.improvements,
      missingKeywords: [...new Set(output.missingKeywords)],
      competitivePosition: output.competitivePosition,
      sections,
    },
    droppedRewrites,
  };
}

export const actionIds = (result: AnalysisResult) =>
  result.sections.flatMap((section) => section.actions.map((action) => action.id));

/** Só ações que existem na análise, sem repetir, na ordem da tela. */
export function validateDoneActions(result: AnalysisResult | null, done: string[]): string[] {
  if (!result) throw new AppError('CONFLICT', 'A análise ainda não terminou.');
  const known = actionIds(result);
  const unknown = done.filter((id) => !known.includes(id));
  if (unknown.length > 0) {
    throw new AppError('VALIDATION_FAILED', 'Ação desconhecida nesta análise.', {
      field: 'doneActions',
    });
  }
  return known.filter((id) => done.includes(id));
}
