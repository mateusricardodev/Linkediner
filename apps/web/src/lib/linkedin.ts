import { actionProgress as progressOf } from './analysis';
import type { LinkedinAnalysis, LinkedinSection } from './types';

export const SECTION_LABELS: Record<LinkedinSection['key'], string> = {
  headline: 'Título',
  about: 'Sobre',
  experience: 'Experiência',
  skills: 'Competências',
  education: 'Formação e certificações',
  completeness: 'Completude do perfil',
  keywords: 'Otimização de palavras-chave',
};

/** Dica fixa de cada parte, para quem não sabe por que ela importa. */
export const SECTION_HINTS: Partial<Record<LinkedinSection['key'], string>> = {
  headline: 'Seu título é o cartão de visita para recrutadores: use palavras-chave e diga o cargo.',
  about: 'O "Sobre" é onde você conta a sua história: abra com o cargo e um resultado.',
  experience: 'Descrições com verbo de ação, tecnologia e resultado aparecem melhor nas buscas.',
  skills:
    'As três primeiras competências aparecem no topo do perfil: escolha as do cargo que você busca.',
  keywords:
    'Recrutadores buscam por termos: eles precisam estar no título, no "Sobre" e nas experiências.',
};

/** Seções que a pessoa edita no LinkedIn: as demais são avaliações gerais. */
export const EDITABLE_ON_LINKEDIN = new Set<LinkedinSection['key']>([
  'headline',
  'about',
  'experience',
  'skills',
  'education',
]);

/** Abre o próprio perfil de quem está logado no LinkedIn, sem o LinkedIner saber qual é. */
export const LINKEDIN_PROFILE_URL = 'https://www.linkedin.com/in/me/';

const FAILURES: Record<string, string> = {
  document_missing: 'O PDF foi apagado antes da análise. Envie de novo.',
  unreadable: 'Não conseguimos ler o PDF. Exporte de novo pelo LinkedIn e envie.',
  no_text: 'O PDF não tem texto. Use o "Salvar como PDF" do próprio LinkedIn.',
  consent_revoked: 'A análise por IA foi desligada antes de terminar.',
  processing_error: 'A análise não terminou por um problema nosso. Tente de novo.',
};

export const failureMessage = (code: string | null) =>
  FAILURES[code ?? ''] ?? FAILURES.processing_error!;

/** Ações por seção, com o que já foi feito: alimenta o painel de próximos passos. */
export const actionProgress = (analysis: LinkedinAnalysis) => progressOf(analysis, SECTION_LABELS);

export { scoreLabel, scoreTone } from './analysis';
