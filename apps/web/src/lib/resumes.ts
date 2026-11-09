import type { BadgeTone } from '../components/ui';
import { apiBlob } from './api';
import type { Job, ProfileScore, Resume, ResumeContent, ResumeItem } from './types';

export const RESUME_STATUS: Record<Resume['status'], { label: string; tone: BadgeTone }> = {
  generating: { label: 'Gerando', tone: 'info' },
  draft: { label: 'Em revisão', tone: 'warning' },
  approved: { label: 'Aprovado', tone: 'success' },
  failed: { label: 'Não gerado', tone: 'danger' },
};

export const RESUME_LANGUAGE_LABELS: Record<Resume['language'], string> = {
  pt: 'Português',
  en: 'Inglês',
};

/** "Senior Backend Engineer · Empresa": como a vaga aparece nas escolhas e na lista. */
export const jobLabel = (job: Pick<Job, 'title' | 'company'>) =>
  [job.title ?? 'Vaga sem título', job.company].filter(Boolean).join(' · ');

/** "Inglês · Para Senior Backend Engineer · Empresa": o que distingue um currículo do outro. */
export function resumeDescription(resume: Pick<Resume, 'language' | 'jobId'>, jobs: Job[]) {
  const job = resume.jobId ? jobs.find((item) => item.id === resume.jobId) : null;
  const target = resume.jobId ? (job ? `Para ${jobLabel(job)}` : 'Para uma vaga apagada') : 'Geral';
  return `${RESUME_LANGUAGE_LABELS[resume.language]} · ${target}`;
}

const FAILURE_MESSAGES: Record<string, string> = {
  no_facts: 'Não há informações suficientes no seu perfil. Envie um documento e tente de novo.',
  consent_revoked: 'A análise por IA foi desligada antes de terminar. Autorize e gere de novo.',
  processing_error: 'A geração não terminou por um problema nosso. Gere de novo.',
};

export const resumeFailureMessage = (code: string | null) =>
  FAILURE_MESSAGES[code ?? ''] ?? FAILURE_MESSAGES.processing_error!;

/** Por que uma frase precisa de confirmação. A pessoa é quem sabe se ela é verdadeira. */
export const SUGGESTION_REASONS: Record<NonNullable<ResumeItem['reason']>, string> = {
  no_source: 'Não encontramos isto nos seus documentos. Confirme só se for verdade.',
  unsupported_value:
    'Esta frase cita um valor ou termo que não está nos seus documentos. Confirme só se for verdade.',
};

const allItems = (content: ResumeContent) => [
  ...content.summary,
  ...content.experiences.flatMap((experience) => experience.bullets),
];

/** Quantas frases ainda aguardam decisão. Com alguma pendente, a API recusa a aprovação. */
export const pendingCount = (content: ResumeContent) =>
  allItems(content).filter((item) => item.status === 'suggested').length;

/**
 * Corpo da restauração de uma frase removida. Uma sugestão guarda o motivo: o texto vai junto para
 * ela virar um fato confirmado, como acontece quando é confirmada direto.
 */
export const restoreDecision = (item: Pick<ResumeItem, 'text' | 'reason'>) =>
  item.reason ? { action: 'confirm' as const, text: item.text } : { action: 'confirm' as const };

const join = (parts: (string | null | undefined)[], separator: string) =>
  parts.filter(Boolean).join(separator);

/** Sem data final, só o início: "atual" seria uma informação que o documento não trouxe. */
export const formatPeriod = (start?: string | null, end?: string | null) =>
  join([start, end], ' – ');

type Data = Record<string, string | null>;

/** As mesmas linhas que saem no arquivo exportado. */
export const SECTION_LINES = {
  education: (d: Data) =>
    join(
      [join([d.degree, d.field], ', '), d.institution, formatPeriod(d.startDate, d.endDate)],
      ' · ',
    ),
  certifications: (d: Data) => join([d.name, d.issuer, d.issuedAt], ' · '),
  projects: (d: Data) => join([d.name, d.description, d.url], ' · '),
  languages: (d: Data) => join([d.name, d.level], ': '),
};

/** O score anterior ao atual, para mostrar a evolução. Sem histórico, não há o que comparar. */
export function previousScore(history: ProfileScore['history']) {
  const sorted = [...history].sort((a, b) => b.calculatedAt.localeCompare(a.calculatedAt));
  return sorted[1] ?? null;
}

/** Baixa um arquivo gerado pela API, que exige o cookie de sessão. */
export async function downloadFile(path: string, format: 'pdf' | 'docx') {
  const blob = await apiBlob(path);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `curriculo.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}

export const downloadResume = (id: string, format: 'pdf' | 'docx') =>
  downloadFile(`/v1/resumes/${id}/export?format=${format}`, format);
