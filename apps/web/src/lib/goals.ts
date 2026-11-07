import { SENIORITY_LABELS } from './jobs';
import type { CareerGoal } from './types';

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
