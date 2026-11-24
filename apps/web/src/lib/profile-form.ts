import { buildFactData, FACT_TYPES } from './facts';
import type { Profile, ProfileFact } from './types';

type FactType = ProfileFact['type'];
type LinkKind = Profile['links'][number]['kind'];
type EditableLink = Exclude<LinkKind, 'other'>;

/** Um item do formulário: um fato já salvo (com id) ou um que a pessoa está criando agora. */
export interface FormItem {
  /** Chave local, estável mesmo antes de o item ter id. */
  key: string;
  id: string | null;
  type: FactType;
  verification: ProfileFact['verification'] | null;
  values: Record<string, string>;
  /** Sugestão que a pessoa marcou para confirmar ao salvar. */
  confirm: boolean;
}

export interface HeaderValues {
  name: string;
  headline: string;
  summary: string;
  location: string;
  industry: string;
  links: Record<EditableLink, string>;
}

export interface ProfileFormState {
  header: HeaderValues;
  items: FormItem[];
  /** Fatos salvos que a pessoa removeu: viram recusados ao salvar. */
  removed: string[];
  /** Links de outros tipos não aparecem no formulário, mas continuam salvos. */
  otherLinks: Profile['links'];
}

export const EDITABLE_LINKS: EditableLink[] = ['linkedin', 'github', 'portfolio'];

/** O que vale como "trabalho atual" no fim de uma experiência, em português e inglês. */
const CURRENT_PATTERN = /^(atual|atualmente|presente|o momento|hoje|present|current|now)$/i;
export const CURRENT_END = 'Atual';
export const isCurrentEnd = (value: string) => CURRENT_PATTERN.test(value.trim());

let counter = 0;
const newKey = () => `novo-${++counter}`;

const valuesOf = (type: FactType, data: Record<string, string | null> = {}) =>
  Object.fromEntries(FACT_TYPES[type].fields.map(({ key }) => [key, data[key] ?? '']));

export function emptyItem(type: FactType, values: Record<string, string> = {}): FormItem {
  return {
    key: newKey(),
    id: null,
    type,
    verification: null,
    values: { ...valuesOf(type), ...values },
    confirm: false,
  };
}

export function initialState(
  name: string | null,
  profile: Profile,
  facts: ProfileFact[],
): ProfileFormState {
  const link = (kind: LinkKind) => profile.links.find((l) => l.kind === kind)?.url ?? '';
  return {
    header: {
      name: name ?? '',
      headline: profile.headline ?? '',
      summary: profile.summary ?? '',
      location: profile.location ?? '',
      industry: profile.industry ?? '',
      links: { linkedin: link('linkedin'), github: link('github'), portfolio: link('portfolio') },
    },
    items: facts
      .filter((fact) => fact.verification !== 'rejected')
      .map((fact) => ({
        key: fact.id,
        id: fact.id,
        type: fact.type,
        verification: fact.verification,
        values: valuesOf(fact.type, fact.data),
        confirm: false,
      })),
    removed: [],
    otherLinks: profile.links.filter((l) => l.kind === 'other'),
  };
}

/** Item novo em que a pessoa não digitou nada: é ignorado, sem erro. */
export const isBlank = (item: FormItem) =>
  item.id === null && Object.values(item.values).every((value) => !value.trim());

const sameValues = (a: Record<string, string>, b: Record<string, string>) =>
  Object.keys({ ...a, ...b }).every((key) => (a[key] ?? '').trim() === (b[key] ?? '').trim());

export const isDirty = (baseline: ProfileFormState, state: ProfileFormState) =>
  JSON.stringify(normalize(baseline)) !== JSON.stringify(normalize(state));

function normalize(state: ProfileFormState) {
  return {
    header: state.header,
    items: state.items
      .filter((item) => !isBlank(item))
      .map(({ id, values, confirm }) => ({ id, values, confirm })),
    removed: state.removed,
  };
}

const TYPE_NAMES: Record<FactType, string> = {
  experience: 'Experiência',
  education: 'Formação',
  skill: 'Skill',
  language: 'Idioma',
  certification: 'Certificação',
  project: 'Projeto',
  achievement: 'Conquista',
};

/** Primeiro problema que impede salvar, numa frase que diz onde está. Null se estiver tudo certo. */
export function validate(state: ProfileFormState): string | null {
  if (!state.header.name.trim()) return 'Informe o seu nome completo.';
  const position: Partial<Record<FactType, number>> = {};
  for (const item of state.items) {
    const n = (position[item.type] = (position[item.type] ?? 0) + 1);
    if (isBlank(item)) continue;
    const { missing } = buildFactData(item.type, item.values);
    if (missing.length > 0) {
      return `${TYPE_NAMES[item.type]} ${n}: preencha ${missing.join(' e ')}.`;
    }
  }
  return null;
}

export interface SavePlan {
  name: string | null;
  profile: {
    headline: string | null;
    summary: string | null;
    location: string | null;
    industry: string | null;
  } | null;
  links: Profile['links'] | null;
  reject: string[];
  update: { key: string; id: string; data: Record<string, string | null> }[];
  confirm: string[];
  create: { key: string; type: FactType; data: Record<string, string | null> }[];
}

const orNull = (value: string) => value.trim() || null;

/** O que mudou desde o último estado salvo, já no formato de cada chamada da API. */
export function planSave(baseline: ProfileFormState, state: ProfileFormState): SavePlan {
  const before = baseline.header;
  const after = state.header;
  const profileChanged = (['headline', 'summary', 'location', 'industry'] as const).some(
    (field) => before[field].trim() !== after[field].trim(),
  );
  const linksChanged = EDITABLE_LINKS.some(
    (kind) => before.links[kind].trim() !== after.links[kind].trim(),
  );
  const saved = new Map(baseline.items.filter((i) => i.id).map((i) => [i.id!, i]));

  const plan: SavePlan = {
    name: after.name.trim() !== before.name.trim() ? after.name.trim() : null,
    profile: profileChanged
      ? {
          headline: orNull(after.headline),
          summary: orNull(after.summary),
          location: orNull(after.location),
          industry: orNull(after.industry),
        }
      : null,
    links: linksChanged
      ? [
          ...EDITABLE_LINKS.map((kind) => ({ kind, url: after.links[kind].trim() })).filter(
            (link) => link.url,
          ),
          ...state.otherLinks,
        ]
      : null,
    reject: state.removed,
    update: [],
    confirm: [],
    create: [],
  };

  for (const item of state.items) {
    if (isBlank(item)) continue;
    const { data } = buildFactData(item.type, item.values);
    if (!item.id) {
      plan.create.push({ key: item.key, type: item.type, data });
      continue;
    }
    const original = saved.get(item.id);
    if (original && !sameValues(original.values, item.values)) {
      plan.update.push({ key: item.key, id: item.id, data });
    } else if (item.confirm) {
      plan.confirm.push(item.id);
    }
  }
  return plan;
}

export const planIsEmpty = (plan: SavePlan) =>
  !plan.name &&
  !plan.profile &&
  !plan.links &&
  [plan.reject, plan.update, plan.confirm, plan.create].every((list) => list.length === 0);
