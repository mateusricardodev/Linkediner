import type { ApplicationState } from '../lib/types';
import type { BadgeTone } from './ui';

/** Os 14 estados da candidatura, em linguagem de quem usa. */
export const APPLICATION_STATE_LABELS: Record<
  ApplicationState,
  { label: string; tone: BadgeTone }
> = {
  recommended: { label: 'Recomendada', tone: 'neutral' },
  saved: { label: 'Salva', tone: 'neutral' },
  analyzing: { label: 'Preparando', tone: 'info' },
  in_review: { label: 'Em revisão', tone: 'accent' },
  awaiting_approval: { label: 'Aguarda sua aprovação', tone: 'warning' },
  approved: { label: 'Aprovada', tone: 'accent' },
  sending: { label: 'Enviando', tone: 'info' },
  sent: { label: 'Enviada', tone: 'success' },
  failed: { label: 'Falhou', tone: 'danger' },
  blocked_by_source: { label: 'Bloqueada pela fonte', tone: 'danger' },
  manual_action_required: { label: 'Envie manualmente', tone: 'warning' },
  interview_received: { label: 'Entrevista', tone: 'success' },
  rejected: { label: 'Não seguiu', tone: 'neutral' },
  closed: { label: 'Encerrada', tone: 'neutral' },
};
