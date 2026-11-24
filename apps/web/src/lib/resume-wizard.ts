import type { Job, ProfileFact } from './types';

/** Etapas de "Gerar currículo", no modelo do Linkelyzer. */
export const WIZARD_STEPS = [
  { key: 'vaga', label: 'Vaga' },
  { key: 'idioma', label: 'Idioma' },
  { key: 'dados', label: 'Seus dados' },
  { key: 'mais', label: 'Mais dados' },
  { key: 'extra', label: 'Material extra' },
  { key: 'gerar', label: 'Gerar' },
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number]['key'];

/**
 * Como a vaga entra: colando o texto (vira uma vaga salva), escolhendo uma já salva ou sem vaga.
 * Nunca pelo link do LinkedIn (ADR 0006).
 */
export type JobChoice =
  | { mode: 'general' }
  | { mode: 'saved'; jobId: string | null }
  | { mode: 'pasted'; jobId: string | null };

export interface WizardContext {
  job: JobChoice;
  jobs: Pick<Job, 'id' | 'status'>[];
  /** Há alterações não salvas no formulário da etapa. */
  dirty: boolean;
  facts: Pick<ProfileFact, 'type' | 'verification'>[];
}

/** Só entra no currículo o que veio de um documento ou foi confirmado pela pessoa. */
export const provenFacts = <F extends Pick<ProfileFact, 'verification'>>(facts: F[]) =>
  facts.filter((f) => f.verification === 'extracted' || f.verification === 'user_confirmed');

export const pendingFacts = <F extends Pick<ProfileFact, 'verification'>>(facts: F[]) =>
  facts.filter((f) => f.verification === 'suggested');

/** Id da vaga que vai para a geração, ou null no currículo geral. */
export const chosenJobId = (job: JobChoice) => (job.mode === 'general' ? null : job.jobId);

/**
 * O que impede de sair da etapa, em uma frase, ou null se dá para seguir.
 * Ninguém perde o que digitou ao trocar de etapa: com alterações, pede para salvar antes.
 */
export function blockReason(step: WizardStep, ctx: WizardContext): string | null {
  if (step === 'vaga') {
    if (ctx.job.mode === 'general') return null;
    if (!ctx.job.jobId) {
      return ctx.job.mode === 'saved'
        ? 'Escolha uma das vagas salvas, ou siga sem vaga.'
        : 'Cole a descrição da vaga e clique em "Ler vaga", ou siga sem vaga.';
    }
    const id = ctx.job.jobId;
    const status = ctx.jobs.find((job) => job.id === id)?.status;
    if (status === 'structuring') return 'Espere a leitura da vaga terminar.';
    if (status !== 'ready') return 'Não conseguimos ler esta vaga. Tente de novo ou siga sem vaga.';
    return null;
  }
  if (step === 'dados' || step === 'mais' || step === 'extra') {
    return ctx.dirty ? 'Salve ou descarte as suas alterações antes de seguir.' : null;
  }
  return null;
}

/** Sem experiência comprovada, não há o que reescrever. */
export function generateBlock(ctx: Pick<WizardContext, 'facts'>): string | null {
  const experiences = provenFacts(ctx.facts).filter((f) => f.type === 'experience').length;
  return experiences === 0
    ? 'Adicione pelo menos uma experiência em "Mais dados" para gerar o currículo.'
    : null;
}

export const stepIndex = (step: WizardStep) => WIZARD_STEPS.findIndex((s) => s.key === step);

/** Lê a etapa da URL, caindo na primeira quando ela não existe. */
export function parseStep(value: string | null): WizardStep {
  return WIZARD_STEPS.find((s) => s.key === value)?.key ?? 'vaga';
}
