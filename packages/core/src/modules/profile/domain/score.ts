import type { FactType, ProfileFact } from './facts';
import type { CareerGoal, Profile, ProfileLink } from './profile';

export const RUBRIC_VERSION = 'v1';

export const SCORE_DISCLAIMER =
  'Este score mede a qualidade e a preparação do perfil. Não indica chance de contratação.';

export type CriterionId =
  | 'experience'
  | 'experience_dates'
  | 'experience_descriptions'
  | 'measurable_results'
  | 'skills'
  | 'education'
  | 'projects'
  | 'languages'
  | 'links'
  | 'summary'
  | 'goal';

/** Pontos máximos de cada critério. A soma é 100. Mudar pesos exige uma nova versão da rubrica. */
export const RUBRIC_V1_WEIGHTS: Record<CriterionId, number> = {
  experience: 15,
  experience_dates: 10,
  experience_descriptions: 10,
  measurable_results: 15,
  skills: 15,
  education: 5,
  projects: 5,
  languages: 5,
  links: 10,
  summary: 5,
  goal: 5,
};

/**
 * Tudo o que a rubrica enxerga. Anos de experiência e datas não contam pelo valor, só pela
 * presença: idade, gênero, raça, deficiência e seus indicadores ficam de fora (ADR 0007).
 */
export interface ScoreInput {
  profile: Pick<Profile, 'headline' | 'summary'>;
  links: Pick<ProfileLink, 'kind'>[];
  goals: Pick<CareerGoal, 'isActive'>[];
  facts: Pick<ProfileFact, 'id' | 'type' | 'data' | 'verification'>[];
}

export interface ScoreFactor {
  criterion: CriterionId;
  kind: 'positive' | 'gap';
  points: number;
  maxPoints: number;
  label: string;
  /** Presente nas lacunas: o que fazer para ganhar os pontos. */
  recommendation: string | null;
  /** Fatos que sustentam o critério. */
  factIds: string[];
}

export interface ScoreResult {
  score: number;
  rubricVersion: string;
  factors: ScoreFactor[];
}

/** Só fatos comprovados contam: recusados e sugestões não confirmadas ficam de fora. */
const isCountable = (fact: ScoreInput['facts'][number]) =>
  fact.verification === 'extracted' || fact.verification === 'user_confirmed';

/** Número que não seja um ano: indica uma métrica de resultado ("40%", "1200 clientes"). */
export function hasMetric(text: string | null | undefined): boolean {
  return /\d/.test((text ?? '').replace(/\b(19|20)\d{2}\b/g, ''));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Evaluation {
  /** De 0 a 1. */
  ratio: number;
  label: string;
  recommendation: string;
  factIds?: string[];
}

function evaluate(input: ScoreInput): Record<CriterionId, Evaluation> {
  const facts = input.facts.filter(isCountable);
  const ofType = (type: FactType) => facts.filter((f) => f.type === type);
  const ids = (list: { id: string }[]) => list.map((f) => f.id);
  const atLeast = (count: number, target: number) => Math.min(count / target, 1);

  const experiences = ofType('experience');
  const dated = experiences.filter((f) => f.data.startDate);
  const described = experiences.filter((f) => f.data.description);
  const withMetric = [
    ...described.filter((f) => hasMetric(f.data.description)),
    ...ofType('achievement').filter((f) => hasMetric(f.data.description)),
  ];
  const skills = ofType('skill');
  const education = [...ofType('education'), ...ofType('certification')];
  const projects = ofType('project');
  const languages = ofType('language');
  const linkKinds = new Set(input.links.map((l) => l.kind));
  const linkRatio =
    (linkKinds.has('github') ? 0.5 : 0) +
    (linkKinds.has('linkedin') ? 0.3 : 0) +
    (linkKinds.has('portfolio') ? 0.2 : 0);
  const summaryParts = [input.profile.headline, input.profile.summary].filter(Boolean).length;
  const experienceTotal = experiences.length;

  return {
    experience: {
      ratio: atLeast(experienceTotal, 2),
      label: plural(experienceTotal, 'experiência no perfil', 'experiências no perfil'),
      recommendation: 'Adicione suas experiências profissionais, com empresa e cargo.',
      factIds: ids(experiences),
    },
    experience_dates: {
      ratio: experienceTotal ? dated.length / experienceTotal : 0,
      label: `${dated.length} de ${experienceTotal} experiências com data`,
      recommendation: 'Informe quando começou cada experiência.',
      factIds: ids(dated),
    },
    experience_descriptions: {
      ratio: experienceTotal ? described.length / experienceTotal : 0,
      label: `${described.length} de ${experienceTotal} experiências com descrição`,
      recommendation: 'Descreva o que você fez em cada experiência.',
      factIds: ids(described),
    },
    measurable_results: {
      ratio: atLeast(withMetric.length, 2),
      label: plural(withMetric.length, 'resultado com número', 'resultados com números'),
      recommendation:
        'Inclua resultados medidos, como "reduzi o tempo de build em 40%". Use só números reais.',
      factIds: ids(withMetric),
    },
    skills: {
      ratio: atLeast(skills.length, 8),
      label: plural(skills.length, 'competência listada', 'competências listadas'),
      recommendation: 'Liste as tecnologias e competências que você usa no trabalho.',
      factIds: ids(skills),
    },
    education: {
      ratio: atLeast(education.length, 1),
      label: plural(education.length, 'formação ou certificação', 'formações ou certificações'),
      recommendation: 'Adicione sua formação ou certificações, se tiver.',
      factIds: ids(education),
    },
    projects: {
      ratio: atLeast(projects.length, 1),
      label: plural(projects.length, 'projeto no perfil', 'projetos no perfil'),
      recommendation: 'Mostre um projeto que você construiu ou de que participou.',
      factIds: ids(projects),
    },
    languages: {
      ratio: atLeast(languages.length, 1),
      label: plural(languages.length, 'idioma informado', 'idiomas informados'),
      recommendation: 'Informe os idiomas que você fala e o nível de cada um.',
      factIds: ids(languages),
    },
    links: {
      ratio: linkRatio,
      label: plural(linkKinds.size, 'tipo de link profissional', 'tipos de link profissional'),
      recommendation: 'Adicione GitHub, LinkedIn e portfólio para que comprovem seu trabalho.',
    },
    summary: {
      ratio: summaryParts / 2,
      label: summaryParts === 2 ? 'Título e resumo preenchidos' : 'Título ou resumo incompleto',
      recommendation: 'Preencha o título e o resumo do perfil.',
    },
    goal: {
      ratio: input.goals.some((g) => g.isActive) ? 1 : 0,
      label: input.goals.some((g) => g.isActive)
        ? 'Objetivo de carreira definido'
        : 'Nenhum objetivo de carreira ativo',
      recommendation: 'Defina um objetivo de carreira para receber vagas mais alinhadas.',
    },
  };
}

/** A partir desta fração dos pontos, o critério aparece como ponto forte, e não como lacuna. */
const POSITIVE_FROM = 0.7;

/** Rubrica determinística: a mesma entrada sempre gera o mesmo score (ADR 0007 e ADR 0013). */
export function computeProfileScore(input: ScoreInput): ScoreResult {
  const evaluations = evaluate(input);
  const factors = (Object.keys(RUBRIC_V1_WEIGHTS) as CriterionId[]).map((criterion) => {
    const { ratio, label, recommendation, factIds } = evaluations[criterion];
    const maxPoints = RUBRIC_V1_WEIGHTS[criterion];
    const positive = ratio >= POSITIVE_FROM;
    return {
      criterion,
      kind: positive ? ('positive' as const) : ('gap' as const),
      points: Math.round(maxPoints * ratio),
      maxPoints,
      label,
      recommendation: ratio < 1 ? recommendation : null,
      factIds: factIds ?? [],
    };
  });
  return {
    score: factors.reduce((total, factor) => total + factor.points, 0),
    rubricVersion: RUBRIC_VERSION,
    factors,
  };
}
