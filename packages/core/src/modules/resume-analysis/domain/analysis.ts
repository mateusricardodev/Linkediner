import { z } from 'zod';
import type { FileCheckReport } from '../../documents';
import { AppError } from '../../shared';

/** Partes do currículo analisadas, na ordem em que aparecem na tela. */
export const SECTION_KEYS = [
  'ats',
  'summary',
  'experience',
  'results',
  'skills',
  'education',
  'keywords',
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/** Seções avaliadas pela IA. A "ats" vem da conferência do arquivo (ADR 0028), sem IA. */
export const AI_SECTION_KEYS = [
  'summary',
  'experience',
  'results',
  'skills',
  'education',
  'keywords',
] as const;

/**
 * Peso de cada parte na nota geral. A soma é 100. A nota geral é calculada aqui, não pela IA:
 * assim ela sempre bate com as notas das seções que a pessoa vê.
 */
export const SECTION_WEIGHTS: Record<SectionKey, number> = {
  ats: 15,
  summary: 10,
  experience: 25,
  results: 15,
  skills: 15,
  education: 5,
  keywords: 15,
};

export const RESUME_ANALYSIS_STATUSES = ['processing', 'ready', 'failed'] as const;
export type ResumeAnalysisStatus = (typeof RESUME_ANALYSIS_STATUSES)[number];

export const RESUME_ANALYZE_QUEUE = {
  name: 'resume.analyze',
  deadLetter: 'resume.analyze.dead',
  /** O provedor de IA fica sobrecarregado por minutos: as tentativas se espaçam (20 s, 40 s, 80 s...). */
  retryLimit: 4,
  retryDelay: 20,
  expireInSeconds: 5 * 60,
} as const;

export interface AnalyzeResumeJob {
  userId: string;
  analysisId: string;
}

export const RESUME_ANALYSIS_FAILURES = {
  documentMissing: 'document_missing',
  unreadable: 'unreadable',
  noText: 'no_text',
  consentRevoked: 'consent_revoked',
  processingError: 'processing_error',
} as const;

export const analysisUsageKey = (analysisId: string) => `resume-analysis:${analysisId}`;

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
        key: z.enum(AI_SECTION_KEYS),
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
        actions: z.array(text(300)).max(4),
      }),
    )
    .max(AI_SECTION_KEYS.length),
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

export interface ResumeAnalysis {
  id: string;
  documentId: string | null;
  status: ResumeAnalysisStatus;
  failureCode: string | null;
  /** Cargo usado como alvo das palavras-chave (do objetivo ativo). */
  targetRole: string | null;
  result: AnalysisResult | null;
  doneActions: string[];
  createdAt: Date;
}

/**
 * Seção "Leitura pelo ATS", montada da conferência do arquivo: a nota é a parte dos itens
 * atendidos, e cada item que falhou vira uma ação, com a recomendação da conferência.
 */
export function atsSection(report: FileCheckReport): AnalysisSection {
  const failing = report.checks.filter((check) => !check.ok);
  const score = report.total === 0 ? 0 : Math.round((report.passed / report.total) * 100);
  return {
    key: 'ats',
    score,
    analysis:
      failing.length === 0
        ? 'O arquivo segue o formato que os sistemas de recrutamento (ATS) leem melhor.'
        : `O arquivo atende ${report.passed} de ${report.total} itens do formato que os sistemas de recrutamento (ATS) leem melhor. Os itens abaixo podem fazer o ATS perder parte do conteúdo.`,
    breakdown: report.checks.map((check) => ({
      criterion: check.label,
      points: check.ok ? 1 : 0,
      max: 1,
    })),
    tip: null,
    actions: failing.map((check, index) => ({
      id: `ats-${index + 1}`,
      text: check.recommendation ?? check.label,
    })),
  };
}

/**
 * Monta o resultado guardado: a seção ATS (quando o arquivo pôde ser medido), uma seção por parte
 * avaliada pela IA (a última vence se ela repetir), nota geral calculada pelos pesos e ids estáveis
 * para as ações.
 */
export function buildResult(
  output: AnalysisOutput,
  fileCheck: FileCheckReport | null,
): AnalysisResult {
  const byKey = new Map<SectionKey, AnalysisSection>();
  if (fileCheck) byKey.set('ats', atsSection(fileCheck));
  for (const section of output.sections) {
    byKey.set(section.key, {
      key: section.key,
      score: section.score,
      analysis: section.analysis,
      breakdown: section.breakdown.map((item) => ({
        ...item,
        points: Math.min(item.points, item.max),
      })),
      tip: section.tip,
      actions: section.actions.map((action, index) => ({
        id: `${section.key}-${index + 1}`,
        text: action,
      })),
    });
  }
  const sections = SECTION_KEYS.filter((key) => byKey.has(key)).map((key) => byKey.get(key)!);
  const weight = sections.reduce((sum, s) => sum + SECTION_WEIGHTS[s.key], 0);
  const score =
    weight === 0
      ? 0
      : Math.round(sections.reduce((sum, s) => sum + s.score * SECTION_WEIGHTS[s.key], 0) / weight);
  return {
    score,
    strengths: output.strengths,
    improvements: output.improvements,
    missingKeywords: [...new Set(output.missingKeywords)],
    competitivePosition: output.competitivePosition,
    sections,
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
