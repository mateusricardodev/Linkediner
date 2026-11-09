import { technologyTerms, tokenize } from '../../matching';
import { normalizeText, type LinkKind } from '../../profile';
import type { ResumeContent, ResumeItem } from './resume';

/**
 * Conferência do currículo pelo padrão dos sistemas de recrutamento (ATS). São regras fixas, sem
 * IA: a mesma entrada sempre gera o mesmo resultado, e cada recomendação diz onde mexer (ADR 0025).
 */
export const ATS_RULES_VERSION = 'v1';

export type AtsCheckId =
  | 'headline'
  | 'linkedin'
  | 'summary'
  | 'experience_dates'
  | 'experience_bullets'
  | 'measurable_results'
  | 'skills'
  | 'education'
  | 'languages'
  | 'job_keywords';

export interface AtsCheck {
  id: AtsCheckId;
  ok: boolean;
  label: string;
  /** Presente quando falha: o que fazer, em uma frase. */
  recommendation: string | null;
}

export type AtsTipCode =
  'action_verb' | 'weak_start' | 'too_long' | 'first_person' | 'symbols' | 'no_metric';

/** Melhoria pontual numa frase do currículo. */
export interface AtsTip {
  itemId: string;
  code: AtsTipCode;
  message: string;
}

export interface AtsReport {
  rulesVersion: string;
  passed: number;
  total: number;
  checks: AtsCheck[];
  tips: AtsTip[];
}

export interface AtsInput {
  content: ResumeContent;
  headline: string | null;
  linkKinds: readonly LinkKind[];
  /** Requisitos das vagas que a pessoa salvou, para achar termos que faltam no currículo. */
  jobRequirements: readonly string[][];
  /** O currículo foi feito para uma vaga: os requisitos são só dela. */
  targeted?: boolean;
}

/** Acima disso, um tópico passa de duas linhas no arquivo exportado. */
export const MAX_BULLET_LENGTH = 220;
const MIN_SKILLS = 6;
const MIN_BULLETS = 2;
const MAX_KEYWORDS = 5;

const visible = (items: ResumeItem[]) => items.filter((i) => i.status !== 'removed');

/**
 * Começos que não dizem o que a pessoa fez. "Participei" e "Ajudei" ficam de fora de propósito:
 * dizem o tamanho real da participação, e trocar por "Liderei" seria exagerar (ADR 0025).
 */
const WEAK_STARTS = new Set([
  'responsavel',
  'responsible',
  'participacao',
  'fui',
  'trabalhei',
  'worked',
  'atuei',
  'tarefas',
  'duties',
]);

/**
 * Verbos de ação irregulares: em inglês, os que não terminam em "ed"; em português, os pretéritos
 * que não terminam em "i" ou "ei" ("Mantive", "Fiz", "Obtive").
 */
const IRREGULAR_VERBS = new Set(
  `led built ran made wrote drove grew won cut set took gave brought found began became held kept
  spearheaded shipped rebuilt rewrote oversaw undertook taught sold bought chose
  mantive obtive tive detive retive contive fiz refiz desfiz satisfiz pus propus compus dispus
  repus trouxe pude soube quis estive`.split(/\s+/),
);

/** "Liderei", "Criei", "Reduzi", "Construí": primeira pessoa do pretérito. "Led", "Improved". */
function startsWithActionVerb(text: string): boolean {
  const first = normalizeText(text.trim().split(/\s+/)[0] ?? '').replace(/[^a-z]/g, '');
  if (first.length < 3 || WEAK_STARTS.has(first)) return false;
  return /(ei|i)$/.test(first) || /ed$/.test(first) || IRREGULAR_VERBS.has(first);
}

const isWeakStart = (text: string) =>
  WEAK_STARTS.has(normalizeText(text.trim().split(/\s+/)[0] ?? '').replace(/[^a-z]/g, ''));

const FIRST_PERSON = /(^|[^\p{L}])(eu|meu|minha|meus|minhas|my)(?=[^\p{L}]|$)/iu;
const SYMBOLS = /[\p{Extended_Pictographic}★☆✔✓✗➜→⇒▪▫◆◇●○■□]/u;

/** Número que não seja um ano: "40%", "1.200 clientes", "3x". */
const hasMetric = (text: string) => /\d/.test(text.replace(/\b(19|20)\d{2}\b/g, ''));

function itemTips(item: ResumeItem): AtsTip[] {
  const tips: AtsTip[] = [];
  const tip = (code: AtsTipCode, message: string) => tips.push({ itemId: item.id, code, message });
  if (isWeakStart(item.text)) {
    tip(
      'weak_start',
      'Comece pelo que você fez, com um verbo no passado, sem aumentar a sua parte: "Mantive", "Desenvolvi" ou "Contribuí com".',
    );
  } else if (!startsWithActionVerb(item.text)) {
    tip(
      'action_verb',
      'Comece com um verbo no passado que diga o que você fez, como "Criei", "Mantive" ou "Built".',
    );
  }
  if (item.text.length > MAX_BULLET_LENGTH) {
    tip('too_long', 'Encurte para até duas linhas: os recrutadores leem os tópicos na diagonal.');
  }
  if (FIRST_PERSON.test(item.text)) {
    tip(
      'first_person',
      'Tire "eu", "meu" e "minha": no currículo, a primeira pessoa fica implícita.',
    );
  }
  if (SYMBOLS.test(item.text)) {
    tip('symbols', 'Tire emojis e símbolos: muitos sistemas de recrutamento não conseguem lê-los.');
  }
  return tips;
}

/** Termos técnicos pedidos nas vagas salvas que não aparecem em nenhuma parte do currículo. */
function missingKeywords(input: AtsInput): string[] {
  const { content } = input;
  const resumeText = [
    ...visible(content.summary).map((i) => i.text),
    ...content.experiences.flatMap((e) => [
      e.title ?? '',
      ...visible(e.bullets).map((b) => b.text),
    ]),
    ...content.skills,
    ...[...content.certifications, ...content.projects].flatMap((d) => Object.values(d)),
  ].join(' ');
  const present = new Set(tokenize(resumeText));

  // Conta em quantas vagas cada termo aparece, para priorizar o que mais se repete.
  const counts = new Map<string, { label: string; jobs: number }>();
  for (const requirements of input.jobRequirements) {
    const inJob = new Map(requirements.flatMap(technologyTerms).map((t) => [t.term, t.label]));
    for (const [term, label] of inJob) {
      if (present.has(term)) continue;
      const entry = counts.get(term) ?? { label, jobs: 0 };
      entry.jobs++;
      counts.set(term, entry);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.jobs - a.jobs || a.label.localeCompare(b.label))
    .slice(0, MAX_KEYWORDS)
    .map((entry) => entry.label);
}

export function analyzeAts(input: AtsInput): AtsReport {
  const { content } = input;
  const experiences = content.experiences;
  const bulletsOf = (e: ResumeContent['experiences'][number]) => visible(e.bullets);
  const undated = experiences.filter((e) => !e.startDate);
  const thin = experiences.filter((e) => bulletsOf(e).length < MIN_BULLETS);
  const allBullets = experiences.flatMap(bulletsOf);
  const withMetric = allBullets.filter((b) => hasMetric(b.text));
  const keywords = missingKeywords(input);

  const check = (id: AtsCheckId, ok: boolean, label: string, recommendation: string) => ({
    id,
    ok,
    label,
    recommendation: ok ? null : recommendation,
  });

  const checks: AtsCheck[] = [
    check(
      'headline',
      Boolean(input.headline?.trim()),
      'Título profissional no topo',
      'Preencha o título do perfil, como "Desenvolvedor Backend Pleno": é a primeira coisa que o ATS e o recrutador leem.',
    ),
    check(
      'linkedin',
      input.linkKinds.includes('linkedin'),
      'Link do LinkedIn nos contatos',
      'Adicione o link do seu LinkedIn no perfil: ele entra nos contatos do currículo.',
    ),
    check(
      'summary',
      visible(content.summary).length > 0,
      'Resumo profissional',
      'Mantenha um resumo de 2 a 4 frases: muitos ATS usam esse trecho para classificar o perfil.',
    ),
    check(
      'experience_dates',
      experiences.length > 0 && undated.length === 0,
      'Datas em todas as experiências',
      undated.length
        ? `Informe quando começou ${undated.map((e) => e.title ?? e.company ?? 'a experiência').join(', ')}: sem data, o ATS não calcula o seu tempo de experiência.`
        : 'Adicione suas experiências, com empresa, cargo e datas.',
    ),
    check(
      'experience_bullets',
      experiences.length > 0 && thin.length === 0,
      `Pelo menos ${MIN_BULLETS} tópicos por experiência`,
      thin.length
        ? `Descreva melhor ${thin.map((e) => e.title ?? e.company ?? 'a experiência').join(', ')}: com menos de ${MIN_BULLETS} tópicos, faltam palavras-chave para o ATS.`
        : 'Adicione suas experiências, com o que você fez em cada uma.',
    ),
    check(
      'measurable_results',
      withMetric.length >= 2,
      'Resultados medidos',
      'Inclua números reais em pelo menos dois tópicos, como tempo, porcentagem, volume ou receita.',
    ),
    check(
      'skills',
      content.skills.length >= MIN_SKILLS,
      `Pelo menos ${MIN_SKILLS} competências`,
      'Liste as tecnologias e ferramentas que você usa: o ATS procura esses nomes exatos.',
    ),
    check(
      'education',
      content.education.length + content.certifications.length > 0,
      'Formação ou certificações',
      'Adicione sua formação ou certificações, se tiver.',
    ),
    check(
      'languages',
      content.languages.length > 0,
      'Idiomas',
      'Informe os idiomas e o nível de cada um. Muitas vagas de tecnologia filtram por inglês.',
    ),
  ];
  if (input.jobRequirements.length > 0) {
    checks.push(
      check(
        'job_keywords',
        keywords.length === 0,
        input.targeted ? 'Termos da vaga escolhida' : 'Termos das vagas que você salvou',
        `${input.targeted ? 'A vaga escolhida pede' : 'As vagas que você salvou pedem'} ${keywords.join(', ')}, e isso não aparece no currículo. Se você tem essa experiência, inclua; se não tem, não inclua.`,
      ),
    );
  }

  const tips = [...visible(content.summary), ...allBullets].flatMap((item) =>
    // O resumo não precisa começar com verbo: só as outras regras valem para ele.
    itemTips(item).filter(
      (t) => content.summary.every((s) => s.id !== item.id) || t.code !== 'action_verb',
    ),
  );
  // Sem número em nenhum tópico da experiência: a dica vai no primeiro, para ter onde mexer.
  for (const experience of experiences) {
    const bullets = bulletsOf(experience);
    if (bullets.length > 0 && !bullets.some((b) => hasMetric(b.text))) {
      tips.push({
        itemId: bullets[0]!.id,
        code: 'no_metric',
        message:
          'Nenhum tópico desta experiência tem um resultado medido. Se você tem um número real, como tempo economizado ou usuários atendidos, inclua.',
      });
    }
  }

  return {
    rulesVersion: ATS_RULES_VERSION,
    passed: checks.filter((c) => c.ok).length,
    total: checks.length,
    checks,
    tips,
  };
}
