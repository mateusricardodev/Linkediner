import type {
  Application,
  ApplicationMaterial,
  ApplicationState,
  BillingSummary,
  CoverLetterContent,
  FormAnswersContent,
  ResumeContent,
  ResumeItem,
} from './types';

export const MATERIAL_TITLES: Record<ApplicationMaterial['kind'], string> = {
  resume: 'Currículo para esta vaga',
  cover_letter: 'Carta de apresentação',
  form_answers: 'Respostas de formulário',
};

const MATERIAL_FAILURES: Record<string, string> = {
  no_facts: 'Não há informações suficientes no seu perfil. Envie um documento e tente de novo.',
  job_deleted: 'A vaga desta candidatura foi apagada.',
  consent_revoked: 'A análise por IA foi desligada antes de terminar. Autorize e gere de novo.',
  processing_error: 'A geração não terminou por um problema nosso. Gere de novo.',
};

export const materialFailureMessage = (code: string | null) =>
  MATERIAL_FAILURES[code ?? ''] ?? MATERIAL_FAILURES.processing_error!;

/** Espelha as transições da API, para só oferecer o que ela aceita. */
const CLOSABLE: readonly ApplicationState[] = [
  'recommended',
  'saved',
  'analyzing',
  'in_review',
  'awaiting_approval',
  'manual_action_required',
];

export const canClose = (state: ApplicationState) => CLOSABLE.includes(state);

export type Outcome = 'interview_received' | 'rejected' | 'closed';

export const OUTCOME_LABELS: Record<Outcome, string> = {
  interview_received: 'Recebi uma entrevista',
  rejected: 'Não seguiu',
  closed: 'Encerrar',
};

const OUTCOMES: Partial<Record<ApplicationState, Outcome[]>> = {
  sent: ['interview_received', 'rejected', 'closed'],
  interview_received: ['rejected', 'closed'],
  rejected: ['closed'],
};

export const outcomesFor = (state: ApplicationState): Outcome[] => OUTCOMES[state] ?? [];

const GROUPS = [
  {
    title: 'Precisa da sua atenção',
    states: [
      'manual_action_required',
      'awaiting_approval',
      'in_review',
      'failed',
      'blocked_by_source',
    ],
  },
  { title: 'Em andamento', states: ['recommended', 'saved', 'analyzing', 'approved', 'sending'] },
  { title: 'Enviadas', states: ['sent', 'interview_received'] },
  { title: 'Encerradas', states: ['rejected', 'closed'] },
] as const satisfies readonly { title: string; states: readonly ApplicationState[] }[];

/** Agrupa pela próxima ação, com as mexidas mais recentemente primeiro. */
export function groupApplications(applications: readonly Application[]) {
  const sorted = [...applications].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return GROUPS.map(({ title, states }) => ({
    title,
    items: sorted.filter((a) => (states as readonly ApplicationState[]).includes(a.state)),
  })).filter((group) => group.items.length > 0);
}

/** Só o que pode sair: frase comprovada ou confirmada. Sugestão pendente e removida ficam fora. */
export const usable = (item: Pick<ResumeItem, 'status'>) =>
  item.status === 'grounded' || item.status === 'user_confirmed';

export const asResume = (m: ApplicationMaterial) => m.content as ResumeContent;
export const asLetter = (m: ApplicationMaterial) => m.content as CoverLetterContent;
export const asAnswers = (m: ApplicationMaterial) => m.content as FormAnswersContent;

function itemsOf(material: ApplicationMaterial): ResumeItem[] {
  if (!material.content) return [];
  if (material.kind === 'resume') {
    const resume = asResume(material);
    return [...resume.summary, ...resume.experiences.flatMap((e) => e.bullets)];
  }
  if (material.kind === 'cover_letter') return asLetter(material).paragraphs;
  return asAnswers(material).answers.flatMap((a) => (a.answer ? [a.answer] : []));
}

/** Frases que ainda aguardam decisão. Com alguma, a API recusa seguir para a aprovação. */
export const pendingInMaterials = (materials: readonly ApplicationMaterial[]) =>
  materials.flatMap(itemsOf).filter((item) => item.status === 'suggested').length;

export const letterText = (material: ApplicationMaterial) =>
  asLetter(material)
    .paragraphs.filter(usable)
    .map((paragraph) => paragraph.text)
    .join('\n\n');

/** Uma pergunta por linha, como a pessoa colou do formulário. */
export const parseQuestions = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

export function hasResumeForApproval(
  application: Pick<Application, 'resumeId'>,
  materials: readonly ApplicationMaterial[],
) {
  return (
    Boolean(application.resumeId) ||
    materials.some((m) => m.kind === 'resume' && m.status === 'ready')
  );
}

const MATERIAL_FEATURES: Record<ApplicationMaterial['kind'], string> = {
  resume: 'resume.tailored',
  cover_letter: 'cover_letter',
  form_answers: 'form_answers',
};

export type MaterialAvailability = 'available' | 'not_in_plan' | 'exhausted';

/** O plano decide. Sem o resumo do plano, deixa pedir: a API tem a palavra final e explica a recusa. */
export function materialAvailability(
  billing: BillingSummary | null,
  kind: ApplicationMaterial['kind'],
): MaterialAvailability {
  const feature = billing?.features.find((f) => f.feature === MATERIAL_FEATURES[kind]);
  if (!feature) return 'available';
  if (feature.limit === 0) return 'not_in_plan';
  return feature.remaining === 0 ? 'exhausted' : 'available';
}
