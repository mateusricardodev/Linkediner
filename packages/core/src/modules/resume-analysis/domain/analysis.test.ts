import { describe, expect, it } from 'vitest';
import type { FileCheckReport } from '../../documents';
import { atsSection, buildResult, validateDoneActions, type AnalysisOutput } from './analysis';

const check = (passed: number, total: number): FileCheckReport => ({
  version: '1',
  passed,
  total,
  checks: Array.from({ length: total }, (_, i) => ({
    id: 'contact' as const,
    ok: i < passed,
    label: `Item ${i + 1}`,
    recommendation: i < passed ? null : `Corrija o item ${i + 1}.`,
  })),
});

const output = (sections: AnalysisOutput['sections']): AnalysisOutput => ({
  strengths: [],
  improvements: [],
  missingKeywords: ['ETL', 'ETL', 'dbt'],
  competitivePosition: 'Ok.',
  sections,
});

const section = (
  key: AnalysisOutput['sections'][number]['key'],
  score: number,
): AnalysisOutput['sections'][number] => ({
  key,
  score,
  analysis: 'x',
  breakdown: [{ criterion: 'c', points: 90, max: 50 }],
  tip: null,
  actions: ['Faça algo', 'Faça outra coisa'],
});

describe('atsSection', () => {
  it('dá a nota pela parte dos itens atendidos e transforma as falhas em ações', () => {
    const s = atsSection(check(5, 7));
    expect(s.score).toBe(71);
    expect(s.actions).toEqual([
      { id: 'ats-1', text: 'Corrija o item 6.' },
      { id: 'ats-2', text: 'Corrija o item 7.' },
    ]);
    expect(s.breakdown[0]).toEqual({ criterion: 'Item 1', points: 1, max: 1 });
  });

  it('tudo certo vira nota 100 sem ações', () => {
    const s = atsSection(check(7, 7));
    expect(s.score).toBe(100);
    expect(s.actions).toEqual([]);
  });
});

describe('buildResult', () => {
  it('ordena as seções, limita os pontos ao máximo e tira palavras repetidas', () => {
    const r = buildResult(
      output([section('keywords', 40), section('summary', 80), section('summary', 90)]),
      check(7, 7),
    );
    expect(r.sections.map((s) => [s.key, s.score])).toEqual([
      ['ats', 100],
      ['summary', 90],
      ['keywords', 40],
    ]);
    expect(r.sections[1]?.breakdown[0]?.points).toBe(50);
    expect(r.sections[1]?.actions.map((a) => a.id)).toEqual(['summary-1', 'summary-2']);
    // (100 × 15 + 90 × 10 + 40 × 15) / 40 = 75
    expect(r.score).toBe(75);
    expect(r.missingKeywords).toEqual(['ETL', 'dbt']);
  });

  it('sem nenhuma seção, a nota é zero', () => {
    expect(buildResult(output([]), null).score).toBe(0);
  });
});

describe('validateDoneActions', () => {
  const result = buildResult(output([section('summary', 80)]), check(6, 7));

  it('mantém só ações conhecidas, na ordem da tela e sem repetir', () => {
    expect(validateDoneActions(result, ['summary-2', 'ats-1', 'summary-2'])).toEqual([
      'ats-1',
      'summary-2',
    ]);
  });

  it('recusa ação desconhecida e análise sem resultado', () => {
    expect(() => validateDoneActions(result, ['x-1'])).toThrow(/desconhecida/);
    expect(() => validateDoneActions(null, [])).toThrow(/não terminou/);
  });
});
