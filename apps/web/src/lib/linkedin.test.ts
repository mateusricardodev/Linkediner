import { describe, expect, it } from 'vitest';
import { actionProgress, failureMessage, scoreLabel, scoreTone } from './linkedin';
import type { LinkedinAnalysis } from './types';

const analysis = (doneActions: string[]): LinkedinAnalysis => ({
  id: '0193b2b0-0000-7000-8000-0000000000a1',
  status: 'ready',
  failureCode: null,
  score: 70,
  targetRole: null,
  actionsDone: doneActions.length,
  actionsTotal: 3,
  createdAt: '2026-11-24T00:00:00.000Z',
  documentId: null,
  doneActions,
  rewritesLocked: false,
  result: {
    score: 70,
    strengths: [],
    improvements: [],
    missingKeywords: [],
    competitivePosition: '',
    sections: [
      {
        key: 'headline',
        score: 80,
        analysis: '',
        breakdown: [],
        tip: null,
        rewrite: null,
        actions: [
          { id: 'headline-1', text: 'A' },
          { id: 'headline-2', text: 'B' },
        ],
      },
      {
        key: 'completeness',
        score: 100,
        analysis: '',
        breakdown: [],
        tip: null,
        rewrite: null,
        actions: [],
      },
      {
        key: 'about',
        score: 60,
        analysis: '',
        breakdown: [],
        tip: null,
        rewrite: null,
        actions: [{ id: 'about-1', text: 'C' }],
      },
    ],
  },
});

describe('actionProgress', () => {
  it('agrupa por seção, sem as seções sem ação, e conta o que foi feito', () => {
    const progress = actionProgress(analysis(['about-1']));
    expect(progress.sections.map((s) => s.label)).toEqual(['Título', 'Sobre']);
    expect(progress).toMatchObject({ total: 3, completed: 1 });
    expect(progress.sections[1]!.actions[0]).toMatchObject({ id: 'about-1', done: true });
  });
});

describe('nota', () => {
  it('dá tom e rótulo pela faixa da nota', () => {
    expect([scoreTone(85), scoreTone(65), scoreTone(30)]).toEqual(['success', 'warning', 'danger']);
    expect(scoreLabel(95)).toBe('Excelente, nível de topo');
    expect(scoreLabel(50)).toBe('Precisa de atenção');
  });

  it('explica a falha, com uma mensagem padrão para códigos desconhecidos', () => {
    expect(failureMessage('no_text')).toMatch(/não tem texto/);
    expect(failureMessage('outro')).toMatch(/problema nosso/);
  });
});
