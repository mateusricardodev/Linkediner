import type { BadgeTone } from '../components/ui';
import type { ProfileFact } from './types';

type FactType = ProfileFact['type'];

interface FactField {
  key: string;
  label: string;
  required?: boolean;
  long?: boolean;
}

/** Espelha os esquemas da API (FACT_DATA_SCHEMAS). A correção substitui todos os campos do fato. */
export const FACT_TYPES: Record<FactType, { title: string; fields: FactField[] }> = {
  experience: {
    title: 'Experiências',
    fields: [
      { key: 'title', label: 'Cargo', required: true },
      { key: 'company', label: 'Empresa', required: true },
      { key: 'startDate', label: 'Início' },
      { key: 'endDate', label: 'Fim' },
      { key: 'location', label: 'Local' },
      { key: 'description', label: 'Descrição', long: true },
    ],
  },
  education: {
    title: 'Formação',
    fields: [
      { key: 'institution', label: 'Instituição', required: true },
      { key: 'degree', label: 'Grau' },
      { key: 'field', label: 'Área' },
      { key: 'startDate', label: 'Início' },
      { key: 'endDate', label: 'Fim' },
    ],
  },
  skill: { title: 'Habilidades', fields: [{ key: 'name', label: 'Habilidade', required: true }] },
  project: {
    title: 'Projetos',
    fields: [
      { key: 'name', label: 'Nome', required: true },
      { key: 'description', label: 'Descrição', long: true },
      { key: 'url', label: 'Link' },
    ],
  },
  certification: {
    title: 'Certificações',
    fields: [
      { key: 'name', label: 'Nome', required: true },
      { key: 'issuer', label: 'Emissor' },
      { key: 'issuedAt', label: 'Data' },
    ],
  },
  language: {
    title: 'Idiomas',
    fields: [
      { key: 'name', label: 'Idioma', required: true },
      { key: 'level', label: 'Nível' },
    ],
  },
  achievement: {
    title: 'Conquistas',
    fields: [{ key: 'description', label: 'Conquista', required: true, long: true }],
  },
};

export const FACT_TYPE_ORDER = Object.keys(FACT_TYPES) as FactType[];

export const VERIFICATION_LABELS: Record<
  ProfileFact['verification'],
  { label: string; tone: BadgeTone }
> = {
  extracted: { label: 'Para revisar', tone: 'neutral' },
  suggested: { label: 'Sugestão', tone: 'warning' },
  user_confirmed: { label: 'Confirmado', tone: 'success' },
  rejected: { label: 'Recusado', tone: 'neutral' },
};

const join = (parts: (string | null | undefined)[], separator = ' · ') =>
  parts.filter(Boolean).join(separator);

/** Título e detalhes de um fato, sem deduzir nada além do que está nos campos. */
export function describeFact({ type, data }: Pick<ProfileFact, 'type' | 'data'>): {
  title: string;
  meta: string;
  body: string | null;
} {
  const period = join([data.startDate, data.endDate], ' – ');
  switch (type) {
    case 'experience':
      return {
        title: join([data.title, data.company], ' em '),
        meta: join([period, data.location]),
        body: data.description ?? null,
      };
    case 'education':
      return {
        title: data.institution ?? '',
        meta: join([data.degree, data.field, period]),
        body: null,
      };
    case 'project':
      return { title: data.name ?? '', meta: data.url ?? '', body: data.description ?? null };
    case 'certification':
      return { title: data.name ?? '', meta: join([data.issuer, data.issuedAt]), body: null };
    case 'language':
      return { title: data.name ?? '', meta: data.level ?? '', body: null };
    case 'achievement':
      return { title: data.description ?? '', meta: '', body: null };
    case 'skill':
      return { title: data.name ?? '', meta: '', body: null };
  }
}

/** Monta os dados da correção: campo vazio vira nulo, e devolve o que falta preencher. */
export function buildFactData(
  type: FactType,
  values: Record<string, string>,
): { data: Record<string, string | null>; missing: string[] } {
  const data: Record<string, string | null> = {};
  const missing: string[] = [];
  for (const field of FACT_TYPES[type].fields) {
    const value = values[field.key]?.trim() ?? '';
    data[field.key] = value || null;
    if (field.required && !value) missing.push(field.label);
  }
  return { data, missing };
}
