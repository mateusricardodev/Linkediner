import { z } from 'zod';

export const LinkedinSectionKey = z
  .enum(['headline', 'about', 'experience', 'skills', 'education', 'completeness', 'keywords'])
  .meta({ id: 'LinkedinSectionKey' });

export const LinkedinAnalysisStatus = z
  .enum(['processing', 'ready', 'failed'])
  .meta({ id: 'LinkedinAnalysisStatus' });

export const LinkedinAnalysisSectionDto = z
  .object({
    key: LinkedinSectionKey,
    score: z.number().int(),
    analysis: z.string(),
    breakdown: z.array(
      z.object({ criterion: z.string(), points: z.number().int(), max: z.number().int() }),
    ),
    tip: z.string().nullable(),
    /** Texto pronto para colar. Nulo sem o plano, sem sugestão ou fora de título, sobre e experiência. */
    rewrite: z.string().nullable(),
    actions: z.array(z.object({ id: z.string(), text: z.string() })),
  })
  .meta({ id: 'LinkedinAnalysisSection' });

export const LinkedinAnalysisResultDto = z
  .object({
    score: z.number().int(),
    strengths: z.array(z.string()),
    improvements: z.array(z.string()),
    missingKeywords: z.array(z.string()),
    competitivePosition: z.string(),
    sections: z.array(LinkedinAnalysisSectionDto),
  })
  .meta({ id: 'LinkedinAnalysisResult' });

/** Item da lista: sem o resultado, que pode ser grande. */
export const LinkedinAnalysisSummaryDto = z
  .object({
    id: z.uuid(),
    status: LinkedinAnalysisStatus,
    /** Motivo da falha: document_missing, unreadable, no_text, consent_revoked ou processing_error. */
    failureCode: z.string().nullable(),
    score: z.number().int().nullable(),
    targetRole: z.string().nullable(),
    actionsDone: z.number().int(),
    actionsTotal: z.number().int(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'LinkedinAnalysisSummary' });

export const LinkedinAnalysisDto = LinkedinAnalysisSummaryDto.extend({
  documentId: z.uuid().nullable(),
  result: LinkedinAnalysisResultDto.nullable(),
  doneActions: z.array(z.string()),
  /** Verdadeiro quando o plano não inclui o texto pronto para colar. */
  rewritesLocked: z.boolean(),
}).meta({ id: 'LinkedinAnalysis' });

export const CreateLinkedinAnalysisBody = z
  .object({ documentId: z.uuid() })
  .strict()
  .meta({ id: 'CreateLinkedinAnalysisBody' });

export const UpdateLinkedinActionsBody = z
  .object({ doneActions: z.array(z.string().max(40)).max(60) })
  .strict()
  .meta({ id: 'UpdateLinkedinActionsBody' });
