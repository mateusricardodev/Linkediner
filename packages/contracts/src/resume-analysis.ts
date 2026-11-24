import { z } from 'zod';

export const ResumeSectionKey = z
  .enum(['ats', 'summary', 'experience', 'results', 'skills', 'education', 'keywords'])
  .meta({ id: 'ResumeSectionKey' });

export const ResumeAnalysisStatus = z
  .enum(['processing', 'ready', 'failed'])
  .meta({ id: 'ResumeAnalysisStatus' });

export const ResumeAnalysisSectionDto = z
  .object({
    key: ResumeSectionKey,
    score: z.number().int(),
    analysis: z.string(),
    breakdown: z.array(
      z.object({ criterion: z.string(), points: z.number().int(), max: z.number().int() }),
    ),
    tip: z.string().nullable(),
    actions: z.array(z.object({ id: z.string(), text: z.string() })),
  })
  .meta({ id: 'ResumeAnalysisSection' });

export const ResumeAnalysisResultDto = z
  .object({
    score: z.number().int(),
    strengths: z.array(z.string()),
    improvements: z.array(z.string()),
    missingKeywords: z.array(z.string()),
    competitivePosition: z.string(),
    sections: z.array(ResumeAnalysisSectionDto),
  })
  .meta({ id: 'ResumeAnalysisResult' });

/** Item da lista: sem o resultado, que pode ser grande. */
export const ResumeAnalysisSummaryDto = z
  .object({
    id: z.uuid(),
    status: ResumeAnalysisStatus,
    /** Motivo da falha: document_missing, unreadable, no_text, consent_revoked ou processing_error. */
    failureCode: z.string().nullable(),
    score: z.number().int().nullable(),
    targetRole: z.string().nullable(),
    actionsDone: z.number().int(),
    actionsTotal: z.number().int(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'ResumeAnalysisSummary' });

export const ResumeAnalysisDto = ResumeAnalysisSummaryDto.extend({
  documentId: z.uuid().nullable(),
  result: ResumeAnalysisResultDto.nullable(),
  doneActions: z.array(z.string()),
}).meta({ id: 'ResumeAnalysis' });

export const CreateResumeAnalysisBody = z
  .object({ documentId: z.uuid() })
  .strict()
  .meta({ id: 'CreateResumeAnalysisBody' });

export const UpdateResumeAnalysisActionsBody = z
  .object({ doneActions: z.array(z.string().max(40)).max(60) })
  .strict()
  .meta({ id: 'UpdateResumeAnalysisActionsBody' });
