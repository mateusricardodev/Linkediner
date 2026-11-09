import { SENIORITY_LABELS } from './jobs';
import type { CareerGoal, ProfileFact } from './types';

type Seniority = CareerGoal['seniority'];

export const MAX_ACTIVE_GOALS = 5;
const LIMITS = { title: { min: 3, max: 80 }, listItems: 10, listItem: 60 };

export const SENIORITY_OPTIONS = Object.entries(SENIORITY_LABELS) as [Seniority, string][];

export const CURRENCY_OPTIONS = ['BRL', 'USD', 'EUR'] as const;

export const PERIOD_LABELS = { month: 'por mês', year: 'por ano' } as const;

export interface GoalForm {
  title: string;
  seniority: Seniority;
  targetRoles: string;
  locations: string;
  remoteOnly: boolean;
  salaryMin: string;
  currency: NonNullable<CareerGoal['currency']>;
  salaryPeriod: NonNullable<CareerGoal['salaryPeriod']>;
}

export const EMPTY_GOAL_FORM: GoalForm = {
  title: '',
  seniority: 'mid',
  targetRoles: '',
  locations: '',
  remoteOnly: false,
  salaryMin: '',
  currency: 'BRL',
  salaryPeriod: 'month',
};

export const formFromGoal = (goal: CareerGoal): GoalForm => ({
  title: goal.title,
  seniority: goal.seniority,
  targetRoles: goal.targetRoles.join(', '),
  locations: goal.locations.join(', '),
  remoteOnly: goal.remoteOnly,
  salaryMin: goal.salaryMin === null ? '' : String(goal.salaryMin),
  currency: goal.currency ?? 'BRL',
  salaryPeriod: goal.salaryPeriod ?? 'month',
});

/** Separa por vírgula ou por linha, sem itens vazios nem repetidos. */
export function parseList(text: string): string[] {
  const items = text
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(items)];
}

/** Só aceita inteiro positivo: "15.000" vira 15000, mas "15,5" é recusado. */
function parseSalary(text: string): number | null {
  const digits = text.trim().replace(/\./g, '');
  return /^[1-9]\d*$/.test(digits) ? Number(digits) : null;
}

/** Monta o corpo para a API, ou explica o que corrigir. A API confere tudo de novo. */
export function buildGoalBody(
  form: GoalForm,
):
  | { body: Omit<CareerGoal, 'id' | 'createdAt' | 'isActive'>; error?: undefined }
  | { error: string; body?: undefined } {
  const title = form.title.trim();
  if (title.length < LIMITS.title.min || title.length > LIMITS.title.max) {
    return {
      error: `O nome do objetivo deve ter entre ${LIMITS.title.min} e ${LIMITS.title.max} caracteres.`,
    };
  }
  const targetRoles = parseList(form.targetRoles);
  const locations = parseList(form.locations);
  for (const [label, list] of [
    ['cargos', targetRoles],
    ['locais', locations],
  ] as const) {
    if (list.length > LIMITS.listItems) {
      return { error: `Informe até ${LIMITS.listItems} ${label}.` };
    }
    if (list.some((item) => item.length > LIMITS.listItem)) {
      return { error: `Cada item de ${label} pode ter até ${LIMITS.listItem} caracteres.` };
    }
  }
  const hasSalary = form.salaryMin.trim() !== '';
  const salaryMin = hasSalary ? parseSalary(form.salaryMin) : null;
  if (hasSalary && salaryMin === null) {
    return { error: 'O salário mínimo deve ser um número inteiro positivo.' };
  }
  return {
    body: {
      title,
      seniority: form.seniority,
      targetRoles,
      locations,
      remoteOnly: form.remoteOnly,
      salaryMin,
      // Valor, moeda e período andam juntos: sem valor, os outros dois não fazem sentido.
      currency: salaryMin === null ? null : form.currency,
      salaryPeriod: salaryMin === null ? null : form.salaryPeriod,
    },
  };
}

export function goalSummary(goal: CareerGoal): string {
  const salary =
    goal.salaryMin === null
      ? null
      : `a partir de ${goal.currency} ${goal.salaryMin.toLocaleString('pt-BR')}${
          goal.salaryPeriod ? ` ${PERIOD_LABELS[goal.salaryPeriod]}` : ''
        }`;
  return [
    SENIORITY_LABELS[goal.seniority],
    goal.remoteOnly ? 'Só remoto' : null,
    goal.targetRoles.join(', ') || null,
    goal.locations.join(', ') || null,
    salary,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** O objetivo em uso: o escolhido, se ainda estiver ativo. Senão, o primeiro ativo, como faz a API. */
export function resolveGoal(goals: readonly CareerGoal[], chosenId: string | null) {
  const active = goals.filter((goal) => goal.isActive);
  return active.find((goal) => goal.id === chosenId) ?? active[0] ?? null;
}

/** Palavras do cargo que dizem o nível, da mais específica para a mais geral. */
const SENIORITY_WORDS: [RegExp, Seniority][] = [
  [/\b(estagiari[oa]|estagio|intern(ship)?)\b/, 'intern'],
  [/\b(junior|jr)\b/, 'junior'],
  [/\b(pleno|mid|middle|pl)\b/, 'mid'],
  [/\b(senior|sr)\b/, 'senior'],
  [/\bstaff\b/, 'staff'],
  [/\bprincipal\b/, 'principal'],
  [/\b(tech lead|lider tecnic[oa]|lead|lider)\b/, 'lead'],
  [/\b(gerente|manager|head|coordenador[a]?)\b/, 'manager'],
];

const normalize = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

const CURRENT = /\b(atual|atualmente|presente|hoje|current|present|now)\b/;
const MONTHS = 'jan fev mar abr mai jun jul ago set out nov dez'.split(' ');
const MONTHS_EN = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');

/** "2021-03", "03/2021", "mar 2021" ou "2021": vira um número comparável. Sem ano, 0. */
function dateOrder(value: string | null | undefined): number {
  const text = normalize(value ?? '');
  const year = /\b(19|20)\d{2}\b/.exec(text);
  if (!year) return 0;
  const numeric =
    /\b(0?[1-9]|1[0-2])[/.-](19|20)\d{2}\b|\b(19|20)\d{2}[/.-](0?[1-9]|1[0-2])\b/.exec(text);
  let month = 0;
  if (numeric) month = Number(numeric[1] ?? numeric[4]);
  else {
    const index = [...MONTHS, ...MONTHS_EN].findIndex((name) => text.includes(name));
    if (index >= 0) month = (index % 12) + 1;
  }
  return Number(year[0]) * 100 + month;
}

/** O cargo sem o nível: "Desenvolvedora Backend Pleno" vira "Desenvolvedora Backend". */
function roleWithoutLevel(title: string): string {
  return (
    title
      .split(/\s+/)
      // Liderança e gestão são o próprio cargo ("Tech Lead"): só o nível sai do nome.
      .filter(
        (word) =>
          !SENIORITY_WORDS.some(
            ([pattern, level]) =>
              level !== 'lead' && level !== 'manager' && pattern.test(normalize(word)),
          ),
      )
      .join(' ')
      .replace(/[\s,–—-]+$/, '')
      .trim()
  );
}

/**
 * Um objetivo sugerido a partir da experiência mais recente que está comprovada: a atual, se houver,
 * e senão a que começou por último. A pessoa confirma ou ajusta: a sugestão nunca é salva sozinha.
 */
export function suggestGoal(
  facts: readonly Pick<ProfileFact, 'type' | 'data' | 'verification'>[],
): { form: GoalForm; role: string; seniorityFound: boolean } | null {
  const experiences = facts.filter(
    (f) =>
      f.type === 'experience' &&
      (f.verification === 'extracted' || f.verification === 'user_confirmed') &&
      f.data.title?.trim(),
  );
  if (experiences.length === 0) return null;
  const isCurrent = (f: (typeof experiences)[number]) =>
    !f.data.endDate?.trim() || CURRENT.test(normalize(f.data.endDate));
  const [latest] = [...experiences].sort(
    (a, b) =>
      Number(isCurrent(b)) - Number(isCurrent(a)) ||
      dateOrder(b.data.startDate) - dateOrder(a.data.startDate),
  );
  const title = latest!.data.title!.trim();
  const role = roleWithoutLevel(title) || title;
  const found = SENIORITY_WORDS.find(([pattern]) => pattern.test(normalize(title)));
  return {
    role,
    seniorityFound: Boolean(found),
    form: {
      ...EMPTY_GOAL_FORM,
      title: role.slice(0, 80),
      targetRoles: role.length <= 60 ? role : '',
      seniority: found?.[1] ?? EMPTY_GOAL_FORM.seniority,
    },
  };
}
