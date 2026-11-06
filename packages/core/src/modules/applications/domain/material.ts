import { z } from 'zod';
import type { ProfileFact } from '../../profile';
import {
  buildResume,
  ResumeOutput,
  toResumeItem,
  type ResumeContent,
  type ResumeItem,
} from '../../resumes';
import { AppError, type FeatureKey } from '../../shared';

export const MATERIALS_GENERATE_QUEUE = {
  name: 'applications.generate_material',
  deadLetter: 'applications.generate_material.dead',
  retryLimit: 2,
  expireInSeconds: 5 * 60,
} as const;

export interface GenerateMaterialJob {
  userId: string;
  applicationId: string;
  materialId: string;
  /** Identifica o consumo do plano, para estornar se a geração falhar. */
  usageId: string;
}

export const materialUsageKey = (usageId: string) => `material:${usageId}`;

export const MATERIAL_FAILURES = {
  noFacts: 'no_facts',
  jobDeleted: 'job_deleted',
  consentRevoked: 'consent_revoked',
  processingError: 'processing_error',
} as const;

export const MATERIAL_KINDS = ['resume', 'cover_letter', 'form_answers'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** Qual limite do plano cada tipo de material gasta. */
export const MATERIAL_FEATURES = {
  resume: 'resume.tailored',
  cover_letter: 'cover_letter',
  form_answers: 'form_answers',
} as const satisfies Record<MaterialKind, FeatureKey>;
export type MaterialStatus = 'generating' | 'ready' | 'failed';

export const FORM_LIMITS = { maxQuestions: 20, maxQuestionChars: 500 } as const;

export interface CoverLetterContent {
  paragraphs: ResumeItem[];
}

export interface FormAnswersContent {
  /** `answer` nulo: os fatos não respondem, e a pessoa precisa responder por conta própria. */
  answers: { question: string; answer: ResumeItem | null }[];
}

export type MaterialContent = ResumeContent | CoverLetterContent | FormAnswersContent;

export interface ApplicationMaterial {
  id: string;
  applicationId: string;
  kind: MaterialKind;
  status: MaterialStatus;
  questions: string[];
  content: MaterialContent | null;
  failureCode: string | null;
}

const Claim = z.object({
  text: z.string().trim().min(1).max(2000),
  factIds: z.array(z.string()).max(20),
});

export const CoverLetterOutput = z.object({ paragraphs: z.array(Claim).max(8) });
export const FormAnswersOutput = z.object({
  answers: z.array(Claim.extend({ questionIndex: z.number().int().min(0) })).max(40),
});
export type CoverLetterOutput = z.infer<typeof CoverLetterOutput>;
export type FormAnswersOutput = z.infer<typeof FormAnswersOutput>;

export const MATERIAL_OUTPUTS = {
  resume: ResumeOutput,
  cover_letter: CoverLetterOutput,
  form_answers: FormAnswersOutput,
} as const;

export const EMPTY_MATERIAL_OUTPUTS = {
  resume: { summary: [], bullets: [] },
  cover_letter: { paragraphs: [] },
  form_answers: { answers: [] },
} as const;

export function validateQuestions(kind: MaterialKind, questions: readonly string[]): string[] {
  const clean = questions.map((q) => q.trim()).filter(Boolean);
  if (kind !== 'form_answers') return [];
  if (clean.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'Informe as perguntas do formulário.');
  }
  if (clean.length > FORM_LIMITS.maxQuestions) {
    throw new AppError('VALIDATION_FAILED', `Informe até ${FORM_LIMITS.maxQuestions} perguntas.`);
  }
  if (clean.some((q) => q.length > FORM_LIMITS.maxQuestionChars)) {
    throw new AppError('VALIDATION_FAILED', 'Uma das perguntas é longa demais.');
  }
  return clean;
}

export interface MaterialReport {
  grounded: number;
  suggested: number;
  unanswered: number;
}

/**
 * Confere o material contra os fatos. Cargo e empresa da vaga podem ser citados por inteiro, mas
 * não comprovam nada sobre a pessoa. Os requisitos da vaga nunca entram na conferência.
 */
export function buildMaterial(input: {
  kind: MaterialKind;
  output: unknown;
  facts: ProfileFact[];
  job: { title: string | null; company: string | null };
  questions: readonly string[];
}): { content: MaterialContent; report: MaterialReport } {
  const { kind, facts, job, questions } = input;
  if (kind === 'resume') {
    const { content, report } = buildResume(input.output as ResumeOutput, facts);
    return {
      content,
      report: { grounded: report.grounded, suggested: report.suggested, unanswered: 0 },
    };
  }

  const usable = facts.filter(
    (f) => f.verification === 'extracted' || f.verification === 'user_confirmed',
  );
  const factsById = new Map(usable.map((f) => [f.id, f]));
  const report: MaterialReport = { grounded: 0, suggested: 0, unanswered: 0 };
  const item = (claim: { text: string; factIds: string[] }) => {
    const result = toResumeItem(claim, factsById, [job.title, job.company]);
    if (result.status === 'grounded') report.grounded++;
    else report.suggested++;
    return result;
  };

  if (kind === 'cover_letter') {
    const { paragraphs } = input.output as CoverLetterOutput;
    return { content: { paragraphs: paragraphs.map(item) }, report };
  }

  const { answers } = input.output as FormAnswersOutput;
  const content: FormAnswersContent = {
    answers: questions.map((question, index) => {
      const answer = answers.find((a) => a.questionIndex === index);
      if (!answer) report.unanswered++;
      return { question, answer: answer ? item(answer) : null };
    }),
  };
  return { content, report };
}

/** Todas as frases do material, seja qual for o tipo. */
export function materialItems(kind: MaterialKind, content: MaterialContent): ResumeItem[] {
  if (kind === 'resume') {
    const resume = content as ResumeContent;
    return [...resume.summary, ...resume.experiences.flatMap((e) => e.bullets)];
  }
  if (kind === 'cover_letter') return (content as CoverLetterContent).paragraphs;
  return (content as FormAnswersContent).answers.flatMap((a) => (a.answer ? [a.answer] : []));
}

/** Frases que ainda aguardam a decisão da pessoa, em todos os materiais. */
export function pendingInMaterials(materials: readonly ApplicationMaterial[]): number {
  return materials.reduce(
    (total, m) =>
      total +
      (m.content
        ? materialItems(m.kind, m.content).filter((i) => i.status === 'suggested').length
        : 0),
    0,
  );
}
