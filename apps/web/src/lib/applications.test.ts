import { describe, expect, it } from 'vitest';
import {
  canClose,
  groupApplications,
  hasResumeForApproval,
  letterText,
  materialAvailability,
  materialFailureMessage,
  outcomesFor,
  parseQuestions,
  pendingInMaterials,
} from './applications';
import type { Application, ApplicationMaterial, ResumeItem } from './types';

const item = (text: string, status: ResumeItem['status']): ResumeItem => ({
  id: text,
  text,
  factIds: [],
  status,
  reason: status === 'suggested' ? 'no_source' : null,
});

const material = (kind: ApplicationMaterial['kind'], content: unknown): ApplicationMaterial =>
  ({
    id: kind,
    applicationId: 'a',
    kind,
    status: 'ready',
    questions: [],
    content,
    failureCode: null,
  }) as ApplicationMaterial;

const application = (id: string, state: Application['state'], updatedAt: string) =>
  ({ id, state, updatedAt }) as Application;

describe('pendingInMaterials', () => {
  it('conta sugestões em todos os tipos de material', () => {
    expect(
      pendingInMaterials([
        material('resume', {
          summary: [item('a', 'suggested')],
          experiences: [{ bullets: [item('b', 'suggested'), item('c', 'grounded')] }],
        }),
        material('cover_letter', { paragraphs: [item('d', 'suggested'), item('e', 'removed')] }),
        material('form_answers', {
          answers: [
            { question: 'q1', answer: item('f', 'suggested') },
            { question: 'q2', answer: null },
          ],
        }),
      ]),
    ).toBe(4);
  });

  it('material ainda sem conteúdo não conta', () => {
    expect(pendingInMaterials([material('cover_letter', null)])).toBe(0);
  });
});

describe('letterText', () => {
  it('copia só o que está comprovado ou confirmado', () => {
    expect(
      letterText(
        material('cover_letter', {
          paragraphs: [
            item('Comprovado.', 'grounded'),
            item('Removido.', 'removed'),
            item('Pendente.', 'suggested'),
            item('Confirmado.', 'user_confirmed'),
          ],
        }),
      ),
    ).toBe('Comprovado.\n\nConfirmado.');
  });
});

describe('estados', () => {
  it('só oferece desistir onde a API aceita', () => {
    expect(canClose('in_review')).toBe(true);
    expect(canClose('manual_action_required')).toBe(true);
    expect(canClose('approved')).toBe(false);
    expect(canClose('sending')).toBe(false);
    expect(canClose('closed')).toBe(false);
  });

  it('só oferece o resultado possível', () => {
    expect(outcomesFor('sent')).toEqual(['interview_received', 'rejected', 'closed']);
    expect(outcomesFor('interview_received')).toEqual(['rejected', 'closed']);
    expect(outcomesFor('rejected')).toEqual(['closed']);
    expect(outcomesFor('in_review')).toEqual([]);
  });

  it('pede um currículo antes da aprovação', () => {
    expect(hasResumeForApproval({ resumeId: null }, [])).toBe(false);
    expect(hasResumeForApproval({ resumeId: 'r' }, [])).toBe(true);
    expect(hasResumeForApproval({ resumeId: null }, [material('cover_letter', {})])).toBe(false);
    expect(hasResumeForApproval({ resumeId: null }, [material('resume', {})])).toBe(true);
  });
});

describe('groupApplications', () => {
  it('agrupa pela próxima ação, com as recentes primeiro, e omite grupos vazios', () => {
    const groups = groupApplications([
      application('antiga', 'in_review', '2026-11-01T00:00:00.000Z'),
      application('nova', 'manual_action_required', '2026-11-07T00:00:00.000Z'),
      application('enviada', 'sent', '2026-11-05T00:00:00.000Z'),
    ]);
    expect(groups.map((g) => g.title)).toEqual(['Precisa da sua atenção', 'Enviadas']);
    expect(groups[0]!.items.map((a) => a.id)).toEqual(['nova', 'antiga']);
  });
});

describe('materialAvailability', () => {
  const billing = (limit: number, remaining: number) => ({
    plan: { key: 'x', name: 'X' },
    features: [
      { feature: 'cover_letter', limit, used: limit - remaining, remaining, resetsAt: null },
    ],
  });

  it('diferencia fora do plano de limite do mês esgotado', () => {
    expect(materialAvailability(billing(0, 0), 'cover_letter')).toBe('not_in_plan');
    expect(materialAvailability(billing(30, 0), 'cover_letter')).toBe('exhausted');
    expect(materialAvailability(billing(30, 5), 'cover_letter')).toBe('available');
  });

  it('sem o resumo do plano, deixa a API decidir', () => {
    expect(materialAvailability(null, 'cover_letter')).toBe('available');
    expect(materialAvailability(billing(0, 0), 'resume')).toBe('available');
  });
});

describe('textos', () => {
  it('lê uma pergunta por linha, sem linhas vazias', () => {
    expect(parseQuestions(' Por que esta vaga? \n\n  Qual sua experiência?\n')).toEqual([
      'Por que esta vaga?',
      'Qual sua experiência?',
    ]);
  });

  it('explica a falha, inclusive para um motivo desconhecido', () => {
    expect(materialFailureMessage('job_deleted')).toMatch(/apagada/);
    expect(materialFailureMessage('novo')).toBe(materialFailureMessage('processing_error'));
  });
});
