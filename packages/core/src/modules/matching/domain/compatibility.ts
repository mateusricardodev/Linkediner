import type { JobFields } from '../../jobs';
import { normalizeText, type CareerGoal, type ProfileFact, type Seniority } from '../../profile';

export const MATCH_RUBRIC_VERSION = 'v1';

export const MATCH_DISCLAIMER =
  'Compara seu perfil com os requisitos da vaga. Não indica chance de contratação.';

export type MatchCriterion = 'must_have' | 'nice_to_have' | 'seniority' | 'work_model';

/** Pesos da rubrica. Critério sem dados fica de fora, e o score é proporcional aos demais. */
export const MATCH_V1_WEIGHTS: Record<MatchCriterion, number> = {
  must_have: 60,
  nice_to_have: 15,
  seniority: 15,
  work_model: 10,
};

/**
 * met: todos os termos estão no perfil. partial: parte dos termos, ou o tempo de experiência
 * pedido não pode ser confirmado. missing: não encontrado no perfil, o que não significa que a
 * pessoa não tenha. unverified: o requisito não traz termos que dê para comparar.
 */
export type RequirementStatus = 'met' | 'partial' | 'missing' | 'unverified';

export interface RequirementMatch {
  text: string;
  kind: 'must_have' | 'nice_to_have';
  status: RequirementStatus;
  factIds: string[];
}

export interface MatchFactor {
  criterion: MatchCriterion;
  kind: 'positive' | 'gap';
  points: number;
  maxPoints: number;
  label: string;
}

export interface MatchResult {
  /** Nulo quando a vaga não traz requisitos: não há o que comparar. */
  score: number | null;
  rubricVersion: string;
  factors: MatchFactor[];
  requirements: RequirementMatch[];
  recommendations: string[];
}

const STOPWORDS = new Set(
  `a o as os de da do das dos e em no na nos nas com para por um uma ou ao sua seu que como pelo menos
  experiencia conhecimento conhecimentos solido solida solidos solidas bom boa boas bons avancado avancada
  intermediario intermediaria basico basica pratica praticas dominio vivencia capacidade habilidade
  habilidades forte fortes ter saber anos ano minimo desejavel obrigatorio diferencial
  an the of and or with in on for to experience knowledge strong good solid advanced intermediate basic
  years year ability skills skill proficient proficiency familiarity plus required preferred`
    .split(/\s+/)
    .filter(Boolean),
);

/** Nomes diferentes para a mesma tecnologia. */
const SYNONYMS: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  nodejs: 'node.js',
  node: 'node.js',
  reactjs: 'react',
  'react.js': 'react',
  vuejs: 'vue',
  'vue.js': 'vue',
  nextjs: 'next.js',
  postgres: 'postgresql',
  k8s: 'kubernetes',
  golang: 'go',
  english: 'ingles',
  portuguese: 'portugues',
  spanish: 'espanhol',
};

/** Palavras comparáveis: "Java" nunca casa com "JavaScript", porque a comparação é por palavra inteira. */
export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9+#.]+/)
    .map((token) => token.replace(/^\.+|\.+$/g, ''))
    .filter((token) => token && !/^[\d.+]+$/.test(token))
    .map((token) => SYNONYMS[token] ?? token);
}

const DURATION = /\b\d+\s*\+?\s*(anos?|years?)\b/;

/** A empresa e as datas ficam de fora: ter trabalhado no Google não comprova saber "Google Cloud". */
const COMPARABLE_FIELDS = new Set([
  'name',
  'title',
  'description',
  'field',
  'degree',
  'level',
  'issuer',
]);

interface IndexedFact {
  id: string;
  tokens: Set<string>;
}

function indexFacts(facts: Pick<ProfileFact, 'id' | 'data' | 'verification'>[]): IndexedFact[] {
  return facts
    .filter((f) => f.verification === 'extracted' || f.verification === 'user_confirmed')
    .map((f) => ({
      id: f.id,
      tokens: new Set(
        Object.entries(f.data).flatMap(([field, value]) =>
          value && COMPARABLE_FIELDS.has(field) ? tokenize(value) : [],
        ),
      ),
    }));
}

export function matchRequirement(
  text: string,
  kind: RequirementMatch['kind'],
  facts: IndexedFact[],
): RequirementMatch {
  const terms = [...new Set(tokenize(text).filter((t) => !STOPWORDS.has(t)))];
  if (terms.length === 0) return { text, kind, status: 'unverified', factIds: [] };

  const supporting = facts.filter((f) => terms.some((t) => f.tokens.has(t)));
  const found = terms.filter((t) => facts.some((f) => f.tokens.has(t)));
  const factIds = supporting.map((f) => f.id);

  if (found.length === 0) return { text, kind, status: 'missing', factIds: [] };
  if (found.length < terms.length) {
    const status = found.length * 2 >= terms.length ? 'partial' : 'missing';
    return { text, kind, status, factIds: status === 'partial' ? factIds : [] };
  }
  // Os termos batem, mas o sistema não tem como confirmar o tempo de experiência pedido.
  return { text, kind, status: DURATION.test(normalizeText(text)) ? 'partial' : 'met', factIds };
}

const CREDIT: Record<RequirementStatus, number> = {
  met: 1,
  partial: 0.5,
  missing: 0,
  unverified: 0,
};

function requirementRatio(list: RequirementMatch[]): number | null {
  const comparable = list.filter((r) => r.status !== 'unverified');
  if (comparable.length === 0) return null;
  return comparable.reduce((total, r) => total + CREDIT[r.status], 0) / comparable.length;
}

const LADDER: Seniority[] = ['intern', 'junior', 'mid', 'senior', 'staff', 'principal'];

/** Compara o nível da vaga com o objetivo declarado pela pessoa, e não com a idade ou o tempo de carreira. */
function seniorityRatio(job: Seniority | null, goal: Seniority | undefined): number | null {
  if (!job || !goal) return null;
  if (job === goal) return 1;
  const a = LADDER.indexOf(job);
  const b = LADDER.indexOf(goal);
  return a >= 0 && b >= 0 && Math.abs(a - b) === 1 ? 0.5 : 0;
}

function workModelRatio(
  job: JobFields['remotePolicy'],
  goal: Pick<CareerGoal, 'remoteOnly'> | undefined,
): number | null {
  if (!goal?.remoteOnly || !job || job === 'unknown') return null;
  return job === 'remote' ? 1 : 0;
}

const count = (list: RequirementMatch[], status: RequirementStatus) =>
  list.filter((r) => r.status === status).length;

export interface MatchInput {
  job: Pick<JobFields, 'mustHave' | 'niceToHave' | 'seniority' | 'remotePolicy'>;
  facts: Pick<ProfileFact, 'id' | 'data' | 'verification'>[];
  goal?: Pick<CareerGoal, 'seniority' | 'remoteOnly'> | undefined;
}

/**
 * Rubrica determinística (ADR 0007 e ADR 0016): a mesma entrada sempre gera o mesmo resultado.
 * Só entram requisitos da vaga, fatos comprovados e o objetivo declarado. Nada de atributos sensíveis.
 */
export function computeCompatibility({ job, facts, goal }: MatchInput): MatchResult {
  const indexed = indexFacts(facts);
  const must = job.mustHave.map((r) => matchRequirement(r, 'must_have', indexed));
  const nice = job.niceToHave.map((r) => matchRequirement(r, 'nice_to_have', indexed));
  const requirements = [...must, ...nice];

  const mustRatio = requirementRatio(must);
  const niceRatio = requirementRatio(nice);
  const seniority = seniorityRatio(job.seniority, goal?.seniority);
  const workModel = workModelRatio(job.remotePolicy, goal);

  const candidates: [MatchCriterion, number | null, string][] = [
    [
      'must_have',
      mustRatio,
      `${count(must, 'met')} de ${must.length} requisitos obrigatórios no perfil`,
    ],
    [
      'nice_to_have',
      niceRatio,
      `${count(nice, 'met')} de ${nice.length} requisitos desejáveis no perfil`,
    ],
    [
      'seniority',
      seniority,
      seniority === 1
        ? 'Nível da vaga igual ao do seu objetivo'
        : 'Nível da vaga diferente do seu objetivo',
    ],
    [
      'work_model',
      workModel,
      workModel === 1
        ? 'Vaga remota, como no seu objetivo'
        : 'Vaga não é remota, e seu objetivo é remoto',
    ],
  ];

  const factors: MatchFactor[] = candidates.flatMap(([criterion, ratio, label]) =>
    ratio === null
      ? []
      : [
          {
            criterion,
            kind: ratio >= 0.7 ? ('positive' as const) : ('gap' as const),
            points: Math.round(MATCH_V1_WEIGHTS[criterion] * ratio),
            maxPoints: MATCH_V1_WEIGHTS[criterion],
            label,
          },
        ],
  );

  const hasRequirements = mustRatio !== null || niceRatio !== null;
  const available = factors.reduce((total, f) => total + f.maxPoints, 0);
  const earned = factors.reduce((total, f) => total + f.points, 0);

  const recommendations: string[] = [];
  if (requirements.some((r) => r.status === 'missing' || r.status === 'partial')) {
    recommendations.push(
      'Se você tem experiência com o que aparece como lacuna, adicione ao perfil. Use só o que for verdadeiro.',
    );
  }
  if (requirements.some((r) => r.status === 'partial')) {
    recommendations.push(
      'Confira o tempo de experiência pedido: o sistema não consegue confirmá-lo.',
    );
  }

  return {
    score: hasRequirements ? Math.round((earned / available) * 100) : null,
    rubricVersion: MATCH_RUBRIC_VERSION,
    factors,
    requirements,
    recommendations,
  };
}
