import { z } from 'zod';
import { normalizeText, type FactData, type ProfileFact } from '../../profile';
import { newId } from '../../shared';

export const RESUMES_GENERATE_QUEUE = {
  name: 'resumes.generate',
  deadLetter: 'resumes.generate.dead',
  retryLimit: 2,
  expireInSeconds: 5 * 60,
} as const;

export interface GenerateResumeJob {
  userId: string;
  resumeId: string;
}

export const RESUME_FAILURES = {
  noFacts: 'no_facts',
  consentRevoked: 'consent_revoked',
  processingError: 'processing_error',
} as const;

export type ResumeStatus = 'generating' | 'draft' | 'approved' | 'failed';

/**
 * grounded: comprovada pelos fatos citados. suggested: precisa da confirmação do usuário e fica
 * fora da exportação até lá. user_confirmed: o usuário confirmou. removed: o usuário removeu.
 */
export type ResumeItemStatus = 'grounded' | 'suggested' | 'user_confirmed' | 'removed';
export type SuggestionReason = 'no_source' | 'unsupported_value';

export interface ResumeItem {
  id: string;
  text: string;
  factIds: string[];
  status: ResumeItemStatus;
  reason: SuggestionReason | null;
}

export interface ResumeExperience {
  factId: string;
  company: string | null;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  bullets: ResumeItem[];
}

export interface ResumeContent {
  summary: ResumeItem[];
  experiences: ResumeExperience[];
  skills: string[];
  education: FactData[];
  certifications: FactData[];
  projects: FactData[];
  languages: FactData[];
}

export interface Resume {
  id: string;
  status: ResumeStatus;
  content: ResumeContent | null;
  failureCode: string | null;
  approvedAt: Date | null;
  createdAt: Date;
}

const Claim = z.object({
  text: z.string().trim().min(1).max(600),
  factIds: z.array(z.string()).max(20),
});

/** Formato pedido à IA: só a redação. Empresa, cargo e datas vêm dos fatos, em código. */
export const ResumeOutput = z.object({
  summary: z.array(Claim).max(6),
  bullets: z.array(Claim.extend({ experienceFactId: z.string() })).max(100),
});
export type ResumeOutput = z.infer<typeof ResumeOutput>;

/** Tecnologias comuns escritas em minúsculas, que a detecção de nomes próprios não pegaria. */
const KNOWN_TECH = [
  'angular',
  'aws',
  'azure',
  'docker',
  'gcp',
  'golang',
  'graphql',
  'java',
  'javascript',
  'kafka',
  'kotlin',
  'kubernetes',
  'mongodb',
  'mysql',
  'nextjs',
  'node',
  'nodejs',
  'php',
  'postgres',
  'postgresql',
  'python',
  'react',
  'redis',
  'ruby',
  'rust',
  'swift',
  'terraform',
  'typescript',
  'vue',
];

const has = (corpus: string, term: string) =>
  corpus.includes(normalizeText(term).replace(/[.,;:!?)]+$/, ''));

/**
 * Procura na frase o que precisa de comprovação: números, nomes próprios e tecnologias.
 * A primeira palavra de cada frase fica de fora dos nomes próprios porque é sempre maiúscula.
 */
export function findUnsupportedTerms(
  text: string,
  citedFacts: Pick<ProfileFact, 'data'>[],
): string[] {
  const corpus = normalizeText(
    citedFacts.flatMap((f) => Object.values(f.data).filter(Boolean)).join(' | '),
  );
  const unsupported = new Set<string>();

  for (const number of text.match(/\d+(?:[.,]\d+)*/g) ?? []) {
    if (!corpus.includes(number)) unsupported.add(number);
  }
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const words = sentence.trim().split(/\s+/).slice(1);
    for (const word of words) {
      const clean = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, '');
      if (/^\p{Lu}/u.test(clean) && !has(corpus, clean)) unsupported.add(clean);
    }
  }
  const normalized = normalizeText(text);
  for (const tech of KNOWN_TECH) {
    if (new RegExp(`\\b${tech}\\b`).test(normalized) && !corpus.includes(tech)) {
      unsupported.add(tech);
    }
  }
  return [...unsupported];
}

/** Troca as menções exatas por uma palavra comum, para não contarem como nome próprio. */
function withoutMentions(text: string, mentions: readonly (string | null)[]): string {
  return mentions.reduce<string>((result, mention) => {
    if (!mention?.trim()) return result;
    const pattern = mention.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return result.replace(new RegExp(pattern, 'giu'), 'vaga');
  }, text);
}

/**
 * Confere uma frase contra os fatos citados. O que não se comprova vira sugestão, nunca fato.
 * `mentions` são nomes que a frase pode citar por inteiro (o cargo e a empresa da vaga). Eles não
 * comprovam nada: uma vaga de "Dev React" não torna verdadeiro "tenho experiência com React".
 */
export function toResumeItem(
  claim: { text: string; factIds: string[] },
  factsById: Map<string, ProfileFact>,
  mentions: readonly (string | null)[] = [],
): ResumeItem {
  const factIds = [...new Set(claim.factIds)].filter((id) => factsById.has(id));
  const base = { id: newId(), text: claim.text, factIds };
  if (factIds.length === 0) return { ...base, status: 'suggested', reason: 'no_source' };
  const cited = factIds.map((id) => factsById.get(id)!);
  return findUnsupportedTerms(withoutMentions(claim.text, mentions), cited).length > 0
    ? { ...base, status: 'suggested', reason: 'unsupported_value' }
    : { ...base, status: 'grounded', reason: null };
}

export interface ResumeReport {
  grounded: number;
  suggested: number;
  discardedBullets: number;
}

/** Monta o currículo. Tudo o que não é redação é copiado dos fatos, sem passar pela IA. */
export function buildResume(
  output: ResumeOutput,
  facts: ProfileFact[],
): { content: ResumeContent; report: ResumeReport } {
  const usable = facts.filter(
    (f) => f.verification === 'extracted' || f.verification === 'user_confirmed',
  );
  const factsById = new Map(usable.map((f) => [f.id, f]));
  const ofType = (type: ProfileFact['type']) => usable.filter((f) => f.type === type);
  const known = new Set(ofType('experience').map((f) => f.id));
  const report: ResumeReport = { grounded: 0, suggested: 0, discardedBullets: 0 };

  const item = (claim: { text: string; factIds: string[] }) => {
    const result = toResumeItem(claim, factsById);
    if (result.status === 'grounded') report.grounded++;
    else report.suggested++;
    return result;
  };

  const summary = output.summary.map(item);
  for (const bullet of output.bullets) {
    if (!known.has(bullet.experienceFactId)) report.discardedBullets++;
  }
  const experiences = ofType('experience').map((f) => ({
    factId: f.id,
    company: f.data.company ?? null,
    title: f.data.title ?? null,
    startDate: f.data.startDate ?? null,
    endDate: f.data.endDate ?? null,
    location: f.data.location ?? null,
    bullets: output.bullets.filter((b) => b.experienceFactId === f.id).map(item),
  }));

  return {
    report,
    content: {
      summary,
      experiences,
      skills: ofType('skill').flatMap((f) => (f.data.name ? [f.data.name] : [])),
      education: ofType('education').map((f) => f.data),
      certifications: ofType('certification').map((f) => f.data),
      projects: ofType('project').map((f) => f.data),
      languages: ofType('language').map((f) => f.data),
    },
  };
}

/** Localiza uma frase do currículo, no resumo ou nas experiências. */
export function findItem(content: ResumeContent, itemId: string): ResumeItem | undefined {
  return [...content.summary, ...content.experiences.flatMap((e) => e.bullets)].find(
    (i) => i.id === itemId,
  );
}
