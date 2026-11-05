import { AppError } from '../../shared';

export const SENIORITIES = [
  'intern',
  'junior',
  'mid',
  'senior',
  'staff',
  'principal',
  'lead',
  'manager',
] as const;
export const CURRENCIES = ['BRL', 'USD', 'EUR'] as const;
export const SALARY_PERIODS = ['month', 'year'] as const;
export const LINK_KINDS = ['linkedin', 'github', 'portfolio', 'other'] as const;

export type Seniority = (typeof SENIORITIES)[number];
export type Currency = (typeof CURRENCIES)[number];
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];
export type LinkKind = (typeof LINK_KINDS)[number];

export const LIMITS = {
  headline: 160,
  summary: 2000,
  maxYearsExperience: 60,
  maxLinks: 10,
  /** Limite inicial. Vai virar entitlement por plano no módulo billing (ADR 0010). */
  maxActiveGoals: 5,
  goalTitle: { min: 3, max: 80 },
  maxListItems: 10,
  listItem: 60,
} as const;

export interface Profile {
  id: string;
  headline: string | null;
  summary: string | null;
  yearsExperience: number | null;
}

export interface ProfileLink {
  kind: LinkKind;
  url: string;
}

export interface CareerGoalInput {
  title: string;
  seniority: Seniority;
  targetRoles: string[];
  locations: string[];
  remoteOnly: boolean;
  salaryMin: number | null;
  currency: Currency | null;
  salaryPeriod: SalaryPeriod | null;
  isActive: boolean;
}

export interface CareerGoal extends CareerGoalInput {
  id: string;
  createdAt: Date;
}

const invalid = (message: string, field: string) =>
  new AppError('VALIDATION_FAILED', message, { field });

export function validateProfilePatch(
  patch: Partial<Omit<Profile, 'id'>>,
): Partial<Omit<Profile, 'id'>> {
  const out: Partial<Omit<Profile, 'id'>> = {};
  if (patch.headline !== undefined) {
    const v = patch.headline?.trim() || null;
    if (v && v.length > LIMITS.headline)
      throw invalid(`O título deve ter até ${LIMITS.headline} caracteres.`, 'headline');
    out.headline = v;
  }
  if (patch.summary !== undefined) {
    const v = patch.summary?.trim() || null;
    if (v && v.length > LIMITS.summary)
      throw invalid(`O resumo deve ter até ${LIMITS.summary} caracteres.`, 'summary');
    out.summary = v;
  }
  if (patch.yearsExperience !== undefined) {
    const v = patch.yearsExperience;
    if (v !== null && (!Number.isInteger(v) || v < 0 || v > LIMITS.maxYearsExperience)) {
      throw invalid(
        `Anos de experiência devem estar entre 0 e ${LIMITS.maxYearsExperience}.`,
        'yearsExperience',
      );
    }
    out.yearsExperience = v;
  }
  return out;
}

const LINKEDIN_HOST = /(^|\.)linkedin\.com$/;
const IP_HOST = /^(\d{1,3}\.){3}\d{1,3}$|^\[.*\]$/;

/**
 * Normaliza e valida um link profissional. Sempre HTTPS, sem endereços locais ou IPs
 * (esses links podem ser lidos pelo sistema no futuro, para análise de GitHub e portfólio).
 */
export function normalizeLink(kind: LinkKind, raw: string): ProfileLink {
  let url: URL;
  try {
    url = new URL(raw.trim().includes('://') ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw invalid('Link inválido.', 'url');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw invalid('O link deve começar com https://.', 'url');
  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase();
  url.hash = '';
  if (url.username || url.password)
    throw invalid('O link não pode conter usuário ou senha.', 'url');
  if (url.hostname === 'localhost' || IP_HOST.test(url.hostname) || !url.hostname.includes('.')) {
    throw invalid('Use um endereço público.', 'url');
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (
    kind === 'linkedin' &&
    !(LINKEDIN_HOST.test(url.hostname) && segments[0] === 'in' && segments[1])
  ) {
    throw invalid('Use o endereço do seu perfil no LinkedIn (linkedin.com/in/...).', 'url');
  }
  if (kind === 'github') {
    if (url.hostname !== 'github.com' || !segments[0])
      throw invalid('Use o endereço do seu perfil no GitHub (github.com/usuario).', 'url');
    url.search = '';
  }
  const normalized = url.toString().replace(/\/$/, '');
  return { kind, url: normalized };
}

export function validateLinks(links: ProfileLink[]): ProfileLink[] {
  if (links.length > LIMITS.maxLinks)
    throw invalid(`Adicione no máximo ${LIMITS.maxLinks} links.`, 'links');
  const normalized = links.map((l) => normalizeLink(l.kind, l.url));
  const seen = new Set<string>();
  for (const l of normalized) {
    if (seen.has(l.url)) throw invalid('Há links repetidos.', 'links');
    seen.add(l.url);
  }
  for (const kind of ['linkedin', 'github'] as const) {
    if (normalized.filter((l) => l.kind === kind).length > 1)
      throw invalid(`Informe apenas um link de ${kind}.`, 'links');
  }
  return normalized;
}

const cleanList = (items: string[], field: string) => {
  const list = [...new Set(items.map((i) => i.trim()).filter(Boolean))];
  if (list.length > LIMITS.maxListItems)
    throw invalid(`Informe no máximo ${LIMITS.maxListItems} itens.`, field);
  if (list.some((i) => i.length > LIMITS.listItem))
    throw invalid(`Cada item deve ter até ${LIMITS.listItem} caracteres.`, field);
  return list;
};

export function validateCareerGoal(input: CareerGoalInput): CareerGoalInput {
  const title = input.title.trim();
  if (title.length < LIMITS.goalTitle.min || title.length > LIMITS.goalTitle.max) {
    throw invalid(
      `O nome do objetivo deve ter entre ${LIMITS.goalTitle.min} e ${LIMITS.goalTitle.max} caracteres.`,
      'title',
    );
  }
  const salaryFields = [input.salaryMin, input.currency, input.salaryPeriod];
  const filled = salaryFields.filter((v) => v !== null).length;
  if (filled !== 0 && filled !== 3) {
    throw invalid('Para informar o salário mínimo, preencha valor, moeda e período.', 'salaryMin');
  }
  if (input.salaryMin !== null && (!Number.isInteger(input.salaryMin) || input.salaryMin <= 0)) {
    throw invalid('O salário mínimo deve ser um número inteiro positivo.', 'salaryMin');
  }
  return {
    ...input,
    title,
    targetRoles: cleanList(input.targetRoles, 'targetRoles'),
    locations: cleanList(input.locations, 'locations'),
  };
}

export function assertCanActivateGoal(activeCount: number) {
  if (activeCount >= LIMITS.maxActiveGoals) {
    throw new AppError(
      'CONFLICT',
      `Você pode ter até ${LIMITS.maxActiveGoals} objetivos ativos. Desative um para criar outro.`,
    );
  }
}
