import type { JobFields } from '../../jobs';
import { normalizeText, type Seniority } from '../../profile';
import { AppError } from '../../shared';
import { LADDER, requirementTerms } from './compatibility';

export const FEEDBACK_REASONS = [
  'liked',
  'disliked',
  'too_senior',
  'misaligned',
  'salary_mismatch',
  'location_mismatch',
  'tech_mismatch',
  'company_blocked',
  'already_applied',
  'more_like_this',
] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

const POSITIVE: readonly FeedbackReason[] = ['liked', 'more_like_this'];

/** Com qualquer um destes motivos, a própria vaga sai das recomendações. */
const HIDES_JOB: readonly FeedbackReason[] = [
  'disliked',
  'too_senior',
  'misaligned',
  'salary_mismatch',
  'location_mismatch',
  'tech_mismatch',
  'company_blocked',
  'already_applied',
];

export interface JobSnapshot {
  company: string | null;
  seniority: Seniority | null;
  remotePolicy: JobFields['remotePolicy'];
  terms: string[];
}

export interface FeedbackRecord {
  jobId: string | null;
  reason: FeedbackReason;
  snapshot: JobSnapshot;
}

type SnapshotSource = Pick<
  JobFields,
  'company' | 'seniority' | 'remotePolicy' | 'mustHave' | 'niceToHave'
>;

export function snapshotOf(job: SnapshotSource): JobSnapshot {
  return {
    company: job.company,
    seniority: job.seniority,
    remotePolicy: job.remotePolicy,
    terms: [...new Set([...job.mustHave, ...job.niceToHave].flatMap(requirementTerms))],
  };
}

/** Recusa combinações sem sentido antes de gravar. */
export function validateFeedback(reasons: readonly FeedbackReason[], job: SnapshotSource) {
  const positive = reasons.some((r) => POSITIVE.includes(r));
  const hidesJob = reasons.some((r) => HIDES_JOB.includes(r) && r !== 'already_applied');
  if (positive && hidesJob) {
    throw new AppError('VALIDATION_FAILED', 'Essas avaliações se contradizem. Escolha uma delas.');
  }
  if (reasons.includes('company_blocked') && !job.company) {
    throw new AppError('VALIDATION_FAILED', 'Esta vaga não identifica a empresa.');
  }
}

export interface LearnedPreferences {
  blockedCompanies: Set<string>;
  /** Peso por termo: positivo quando a pessoa pediu mais, negativo quando recusou a tecnologia. */
  termWeights: Map<string, number>;
  /** Menor nível marcado como "muito sênior". */
  tooSeniorFrom: number | null;
  avoidedWorkModels: Set<string>;
}

/** Só aprende com o que a própria pessoa informou. O modelo-base não é treinado. */
export function learnPreferences(feedback: readonly FeedbackRecord[]): LearnedPreferences {
  const prefs: LearnedPreferences = {
    blockedCompanies: new Set(),
    termWeights: new Map(),
    tooSeniorFrom: null,
    avoidedWorkModels: new Set(),
  };
  const addTerms = (terms: string[], delta: number) => {
    for (const term of terms)
      prefs.termWeights.set(term, (prefs.termWeights.get(term) ?? 0) + delta);
  };

  for (const { reason, snapshot } of feedback) {
    if (reason === 'company_blocked' && snapshot.company) {
      prefs.blockedCompanies.add(normalizeText(snapshot.company));
    } else if (reason === 'liked' || reason === 'more_like_this') {
      addTerms(snapshot.terms, 1);
    } else if (reason === 'tech_mismatch') {
      addTerms(snapshot.terms, -1);
    } else if (reason === 'too_senior' && snapshot.seniority) {
      const level = LADDER.indexOf(snapshot.seniority);
      if (level >= 0) {
        prefs.tooSeniorFrom =
          prefs.tooSeniorFrom === null ? level : Math.min(prefs.tooSeniorFrom, level);
      }
    } else if (
      reason === 'location_mismatch' &&
      snapshot.remotePolicy &&
      snapshot.remotePolicy !== 'unknown'
    ) {
      prefs.avoidedWorkModels.add(snapshot.remotePolicy);
    }
  }
  return prefs;
}

export const RANK_LIMITS = {
  /** Quanto as preferências podem mover a posição, para cima ou para baixo. */
  maxAdjustment: 15,
  pointsPerTerm: 2,
  tooSenior: 10,
  avoidedWorkModel: 5,
  /** Termos citados na explicação. */
  termsInExplanation: 3,
} as const;

export interface RankResult {
  /** Posição na lista. Nunca altera o score de compatibilidade. */
  rankScore: number | null;
  hidden: boolean;
  explanation: string[];
}

export function rankJob(input: {
  jobId: string;
  score: number | null;
  job: SnapshotSource;
  preferences: LearnedPreferences;
  ownReasons: readonly FeedbackReason[];
}): RankResult {
  const { score, job, preferences, ownReasons } = input;
  const explanation: string[] = [];

  const blocked =
    job.company !== null && preferences.blockedCompanies.has(normalizeText(job.company));
  if (blocked || ownReasons.some((r) => HIDES_JOB.includes(r))) {
    return { rankScore: null, hidden: true, explanation };
  }

  const terms = snapshotOf(job).terms;
  const weighted = terms
    .map((term) => ({ term, weight: preferences.termWeights.get(term) ?? 0 }))
    .filter((t) => t.weight !== 0)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight) || a.term.localeCompare(b.term));
  let adjustment = weighted.reduce((t, w) => t + w.weight * RANK_LIMITS.pointsPerTerm, 0);

  const liked = weighted.filter((w) => w.weight > 0).map((w) => w.term);
  const disliked = weighted.filter((w) => w.weight < 0).map((w) => w.term);
  const list = (items: string[]) => items.slice(0, RANK_LIMITS.termsInExplanation).join(', ');
  if (liked.length) explanation.push(`Pede ${list(liked)}, como vagas que você avaliou bem`);
  if (disliked.length)
    explanation.push(`Pede ${list(disliked)}, que você marcou como incompatível`);

  const level = job.seniority ? LADDER.indexOf(job.seniority) : -1;
  if (preferences.tooSeniorFrom !== null && level >= preferences.tooSeniorFrom) {
    adjustment -= RANK_LIMITS.tooSenior;
    explanation.push('Nível que você marcou como muito sênior');
  }
  if (job.remotePolicy && preferences.avoidedWorkModels.has(job.remotePolicy)) {
    adjustment -= RANK_LIMITS.avoidedWorkModel;
    explanation.push('Modelo de trabalho que você marcou como inadequado');
  }

  if (score === null) return { rankScore: null, hidden: false, explanation };
  const limited = Math.max(
    -RANK_LIMITS.maxAdjustment,
    Math.min(RANK_LIMITS.maxAdjustment, adjustment),
  );
  return {
    rankScore: Math.max(0, Math.min(100, score + limited)),
    hidden: false,
    explanation,
  };
}
