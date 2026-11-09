import type { BadgeTone } from '../components/ui';
import type { FeedbackReason, Job, JobMatch, Recommendations } from './types';

export const JOB_STATUS: Record<Job['status'], { label: string; tone: BadgeTone }> = {
  structuring: { label: 'Analisando', tone: 'info' },
  ready: { label: 'Pronta', tone: 'success' },
  failed: { label: 'Não analisada', tone: 'danger' },
};

const FAILURE_MESSAGES: Record<string, string> = {
  consent_revoked: 'A análise por IA foi desligada antes de terminar. Autorize e tente de novo.',
  processing_error: 'A análise não terminou por um problema nosso. Tente de novo.',
};

export const jobFailureMessage = (code: string | null) =>
  FAILURE_MESSAGES[code ?? ''] ?? FAILURE_MESSAGES.processing_error!;

export const SENIORITY_LABELS: Record<NonNullable<Job['seniority']>, string> = {
  intern: 'Estágio',
  junior: 'Júnior',
  mid: 'Pleno',
  senior: 'Sênior',
  staff: 'Staff',
  principal: 'Principal',
  lead: 'Liderança técnica',
  manager: 'Gestão',
};

export const REMOTE_LABELS: Record<NonNullable<Job['remotePolicy']>, string | null> = {
  remote: 'Remoto',
  hybrid: 'Híbrido',
  onsite: 'Presencial',
  unknown: null,
};

/** "Não encontrado" nunca é "você não tem": o perfil pode só não mencionar. */
export const REQUIREMENT_STATUS: Record<
  JobMatch['requirements'][number]['status'],
  { label: string; tone: BadgeTone }
> = {
  met: { label: 'Encontrado no perfil', tone: 'success' },
  partial: { label: 'Em parte', tone: 'accent' },
  // O requisito não traz termos comparáveis, como tempo de experiência: só a pessoa sabe dizer.
  unverified: { label: 'Confira você', tone: 'neutral' },
  missing: { label: 'Não encontrado no perfil', tone: 'neutral' },
};

/** Só abre links HTTPS. A API já valida, e a tela não depende disso. */
export function safeExternalUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function jobMeta(job: Job): string {
  return [
    job.company,
    job.location,
    job.remotePolicy ? REMOTE_LABELS[job.remotePolicy] : null,
    job.seniority ? SENIORITY_LABELS[job.seniority] : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const POSITIVE: readonly FeedbackReason[] = ['liked', 'more_like_this'];

export const FEEDBACK_OPTIONS: { reason: FeedbackReason; label: string; positive: boolean }[] = [
  { reason: 'liked', label: 'Gostei', positive: true },
  { reason: 'more_like_this', label: 'Quero mais assim', positive: true },
  { reason: 'disliked', label: 'Não gostei', positive: false },
  { reason: 'too_senior', label: 'Sênior demais', positive: false },
  { reason: 'misaligned', label: 'Fora do meu objetivo', positive: false },
  { reason: 'salary_mismatch', label: 'Salário não atende', positive: false },
  { reason: 'location_mismatch', label: 'Local ou modelo de trabalho', positive: false },
  { reason: 'tech_mismatch', label: 'Tecnologias não combinam', positive: false },
  { reason: 'company_blocked', label: 'Não quero esta empresa', positive: false },
  { reason: 'already_applied', label: 'Já me candidatei', positive: false },
];

/**
 * Marca ou desmarca um motivo. A API recusa elogio junto de recusa, então escolher um lado limpa o
 * outro. "Já me candidatei" não contradiz nada: gostar e já ter se candidatado pode ser verdade.
 */
export function toggleReason(
  current: readonly FeedbackReason[],
  reason: FeedbackReason,
): FeedbackReason[] {
  if (current.includes(reason)) return current.filter((r) => r !== reason);
  if (reason === 'already_applied') return [...current, reason];
  const positive = POSITIVE.includes(reason);
  return [
    ...current.filter((r) => r === 'already_applied' || POSITIVE.includes(r) === positive),
    reason,
  ];
}

/** Qualquer motivo além de "gostei" tira a vaga das recomendações. */
export const hidesJob = (reasons: readonly FeedbackReason[]) =>
  reasons.some((reason) => !POSITIVE.includes(reason));

/** Vagas prontas que não voltaram nas recomendações: avaliadas ou com candidatura enviada. */
export function hiddenJobs(jobs: readonly Job[], recommendations: Recommendations): Job[] {
  const shown = new Set(recommendations.items.map((item) => item.job.id));
  return jobs.filter((job) => job.status === 'ready' && !shown.has(job.id));
}

const SOURCE_LABELS: Record<string, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  smartrecruiters: 'SmartRecruiters',
  github: 'comunidade no GitHub',
};

export const sourceLabel = (source: string) => SOURCE_LABELS[source] ?? source;

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_POSTING_DAYS = 7;

const daysAgo = (iso: string, now: number) => Math.floor((now - new Date(iso).getTime()) / DAY_MS);

/** Publicada nos últimos dias: é o que a lista prioriza. */
export const isNewPosting = (iso: string | null, now = Date.now()) =>
  iso !== null && daysAgo(iso, now) < NEW_POSTING_DAYS;

export function postedLabel(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const days = daysAgo(iso, now);
  if (days <= 0) return 'Publicada hoje';
  if (days === 1) return 'Publicada ontem';
  return `Publicada há ${days} dias`;
}
