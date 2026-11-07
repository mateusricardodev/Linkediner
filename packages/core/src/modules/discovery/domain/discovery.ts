import { createHash } from 'node:crypto';
import { normalizeText, type CareerGoal } from '../../profile';

/** Uma vaga como a fonte publica, já em texto puro. */
export interface ExternalPosting {
  externalId: string;
  title: string;
  location: string;
  /** A fonte diz que é remota. A análise da vaga pode confirmar depois. */
  remoteHint: boolean;
  applyUrl: string;
  postedAt: Date | null;
  body: string;
}

const MAX_RAW_TEXT = 30_000;

/** A API pode aumentar o texto: acima disso, a vaga é cortada, nunca recusada. */
export function buildRawText(
  posting: Pick<ExternalPosting, 'title' | 'location' | 'body'>,
  company: string,
): string {
  return `${posting.title}\n${company}\n${posting.location}\n\n${posting.body}`
    .trim()
    .slice(0, MAX_RAW_TEXT);
}

export const contentHash = (rawText: string) =>
  createHash('sha256').update(normalizeText(rawText)).digest('hex');

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const decodeEntities = (text: string) =>
  text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith('#')) {
      const hex = code[1]?.toLowerCase() === 'x';
      const value = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(value) && value <= 0x10ffff ? String.fromCodePoint(value) : ' ';
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });

/**
 * Texto puro para análise. O resultado nunca é exibido como HTML. O Greenhouse manda o HTML
 * escapado, então as entidades são lidas antes e depois de tirar as marcações.
 */
export function htmlToText(html: string): string {
  const text = decodeEntities(html)
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr)\s*>|<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, ' ');
  return decodeEntities(text)
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const BRAZIL =
  /\b(brasil|brazil|sao paulo|rio de janeiro|belo horizonte|curitiba|recife|porto alegre|florianopolis|campinas|brasilia|salvador|fortaleza|sp|rj|mg|pr|sc|rs|pe)\b/;
const LATAM = /\b(latam|latin america|south america|america latina)\b/;
const REMOTE = /\b(remot[oea]s?|home ?office|anywhere)\b/;

const TECH_TITLE =
  /\b(software|engenheir[oa]s?|engineer(ing)?|developer|desenvolvedor[a]?|programador[a]?|dev|devops|devsecops|sre|frontend|front[ -]end|backend|back[ -]end|full[ -]?stack|mobile|android|ios|cloud|infra(estrutura)?|platform|plataforma|dados|data|machine learning|ml|ia|ai|qa|quality assurance|testes|seguranca|security|cyber|arquitet[oa]|architect|tech lead|tecnologia|sistemas|product manager|product designer|ux)\b/;

/**
 * O catálogo guarda só o que pode servir: tecnologia, no Brasil ou remoto na América Latina.
 * Reduz o que é copiado da fonte e o gasto com análise. Vaga remota de outro país fica de fora.
 */
export function isRelevantPosting(
  posting: Pick<ExternalPosting, 'title' | 'location' | 'remoteHint'>,
): boolean {
  if (!TECH_TITLE.test(normalizeText(posting.title))) return false;
  const location = normalizeText(posting.location);
  if (BRAZIL.test(location)) return true;
  return LATAM.test(location) && (posting.remoteHint || REMOTE.test(location));
}

/** Palavras do nome do objetivo que descrevem nível ou formato, não o cargo. */
const NOT_A_ROLE = new Set(
  'a as com da de do e em na no o os para pessoa por sr jr senior pleno junior estagio estagiario estagiaria staff principal lead remoto remota remote hibrido hibrida hybrid presencial onsite vaga vagas objetivo trabalho'.split(
    ' ',
  ),
);

const SYNONYMS = [
  ['desenvolvedor', 'desenvolvedora', 'developer', 'dev', 'programador', 'programadora'],
  ['engenheiro', 'engenheira', 'engineer'],
  ['dados', 'data'],
  ['analista', 'analyst'],
  ['seguranca', 'security'],
  ['arquiteto', 'arquiteta', 'architect'],
  ['produto', 'product'],
  ['infraestrutura', 'infra', 'infrastructure'],
  ['plataforma', 'platform'],
];

const compact = (text: string) => normalizeText(text).replace(/[^a-z0-9+#]/g, '');
const words = (text: string) =>
  normalizeText(text)
    .split(/[^a-z0-9+#]+/)
    .filter(Boolean);

function alternatives(word: string): string[] {
  return SYNONYMS.find((group) => group.includes(word)) ?? [word];
}

/** Cada palavra do cargo aparece no título, em qualquer ordem e em português ou inglês. */
function titleHasRole(title: string, role: string): boolean {
  const target = compact(title);
  // Sem espaços, "Front-end" e "Frontend" são a mesma coisa.
  if (compact(role).length > 0 && target.includes(compact(role))) return true;
  const roleWords = words(role).filter((word) => !NOT_A_ROLE.has(word));
  return (
    roleWords.length > 0 &&
    roleWords.every((word) => alternatives(word).some((option) => target.includes(option)))
  );
}

export type GoalFilter = Pick<CareerGoal, 'title' | 'targetRoles' | 'locations' | 'remoteOnly'>;

export interface PostingForGoal {
  title: string;
  location: string;
  remoteHint: boolean;
  remotePolicy: string | null;
}

const isRemotePosting = (posting: PostingForGoal) =>
  posting.remotePolicy === 'remote' ||
  (posting.remotePolicy === null || posting.remotePolicy === 'unknown'
    ? posting.remoteHint || REMOTE.test(normalizeText(posting.location))
    : false);

/** Usa o que o objetivo declara. É só um filtro: o número de compatibilidade vem das regras dela. */
export function matchesGoal(posting: PostingForGoal, goal: GoalFilter): boolean {
  const roles = goal.targetRoles.length > 0 ? goal.targetRoles : [goal.title];
  const hasRoleWords = roles.some((role) => words(role).some((word) => !NOT_A_ROLE.has(word)));
  // Um objetivo como "Sênior remoto" não diz o cargo: a área já foi filtrada no catálogo.
  if (hasRoleWords && !roles.some((role) => titleHasRole(posting.title, role))) return false;

  const remote = isRemotePosting(posting);
  if (goal.remoteOnly && !remote) return false;
  if (goal.locations.length > 0 && !remote) {
    const location = normalizeText(posting.location);
    return goal.locations.some((place) => location.includes(normalizeText(place)));
  }
  return true;
}
