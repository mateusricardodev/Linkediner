import type { ProfileFact } from './types';
import { suggestGoal } from './goals';

export type ChecklistItem =
  'open_to_work' | 'custom_url' | 'headline' | 'about' | 'skills' | 'job_preferences' | 'photo';

/**
 * Ajustes no LinkedIn que ajudam recrutadores a encontrar a pessoa. Ela faz no LinkedIn e marca
 * aqui: o LinkedIner não acessa a conta. Os nomes dos menus podem mudar no LinkedIn.
 */
export const CHECKLIST: { id: ChecklistItem; title: string; how: string }[] = [
  {
    id: 'open_to_work',
    title: 'Mostre aos recrutadores que você está aberto a vagas',
    how: 'No seu perfil, em "Aberto a" e depois "Encontrar um novo emprego", escolha os cargos e deixe a visibilidade como "Somente recrutadores". O LinkedIn tenta esconder isso dos recrutadores da sua empresa atual, mas não garante.',
  },
  {
    id: 'custom_url',
    title: 'Personalize o endereço do seu perfil',
    how: 'Em "Editar perfil público e URL", troque os números por algo como linkedin.com/in/seu-nome. Fica mais fácil de pôr no currículo e de achar.',
  },
  {
    id: 'headline',
    title: 'Escreva um título com o cargo e as tecnologias',
    how: 'O título aparece nas buscas dos recrutadores. Use o cargo que você busca e 2 ou 3 tecnologias.',
  },
  {
    id: 'about',
    title: 'Preencha a seção "Sobre"',
    how: 'De 3 a 5 frases sobre o que você faz e os resultados que já teve. Recrutadores buscam pelas palavras desse texto.',
  },
  {
    id: 'skills',
    title: 'Liste as suas competências',
    how: 'Adicione as tecnologias que você usa e ligue cada uma às experiências em que a usou.',
  },
  {
    id: 'job_preferences',
    title: 'Configure as preferências de vaga',
    how: 'Informe cargos, locais e se aceita remoto ou híbrido. O LinkedIn usa isso para sugerir o seu perfil a recrutadores.',
  },
  {
    id: 'photo',
    title: 'Use uma foto de rosto e um banner',
    how: 'Um perfil com foto passa mais confiança. Uma foto simples, com fundo neutro, basta.',
  },
];

/**
 * Exemplo de título a partir do perfil: o cargo da experiência mais recente e as primeiras
 * competências comprovadas. É só um exemplo: a pessoa escreve o dela.
 */
export function headlineExample(
  facts: readonly Pick<ProfileFact, 'type' | 'data' | 'verification'>[],
): string | null {
  const role = suggestGoal(facts)?.role;
  if (!role) return null;
  const skills = facts
    .filter(
      (f) =>
        f.type === 'skill' &&
        (f.verification === 'extracted' || f.verification === 'user_confirmed') &&
        f.data.name?.trim(),
    )
    .map((f) => f.data.name!.trim())
    .slice(0, 3);
  return [role, ...skills].join(' · ');
}
