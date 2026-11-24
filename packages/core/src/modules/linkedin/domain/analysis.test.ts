import { describe, expect, it } from 'vitest';
import {
  buildResult,
  unsupportedNumbers,
  validateDoneActions,
  type AnalysisOutput,
} from './analysis';

const SOURCE = `Analista de Dados
Reduzi o tempo de relatórios em 40% em 2025.
Competências: SQL, Python`;

const section = (
  key: AnalysisOutput['sections'][number]['key'],
  score: number,
  o: Partial<AnalysisOutput['sections'][number]> = {},
): AnalysisOutput['sections'][number] => ({
  key,
  score,
  analysis: `Análise de ${key}.`,
  breakdown: [],
  tip: null,
  rewrite: null,
  actions: [],
  ...o,
});

const output = (sections: AnalysisOutput['sections']): AnalysisOutput => ({
  strengths: ['SQL e Python'],
  improvements: ['Título genérico'],
  missingKeywords: ['Power BI', 'Power BI', 'ETL'],
  competitivePosition: 'Perfil competitivo para vagas júnior.',
  sections,
});

describe('unsupportedNumbers', () => {
  it('aceita números que estão no perfil, em qualquer formato', () => {
    expect(unsupportedNumbers('Cortei 40% do tempo desde 2025', SOURCE)).toEqual([]);
  });

  it('aponta números que não estão no perfil', () => {
    expect(unsupportedNumbers('Liderei 12 pessoas e cortei 40%', SOURCE)).toEqual(['12']);
  });
});

describe('buildResult', () => {
  it('calcula a nota geral pelos pesos, não pela IA', () => {
    const { result } = buildResult(
      output([section('headline', 100), section('experience', 40)]),
      SOURCE,
    );
    // (100 × 15 + 40 × 25) / 40 = 62,5
    expect(result.score).toBe(63);
    expect(result.missingKeywords).toEqual(['Power BI', 'ETL']);
  });

  it('descarta o texto pronto com número inventado e em seções sem texto pronto', () => {
    const { result, droppedRewrites } = buildResult(
      output([
        section('headline', 80, { rewrite: 'Analista de Dados | 40% mais rápido' }),
        section('about', 70, { rewrite: 'Analista com 10 anos de experiência.' }),
        section('skills', 60, { rewrite: 'SQL, Python' }),
      ]),
      SOURCE,
    );
    expect(result.sections.map((s) => [s.key, s.rewrite])).toEqual([
      ['headline', 'Analista de Dados | 40% mais rápido'],
      ['about', null],
      ['skills', null],
    ]);
    expect(droppedRewrites).toBe(1);
  });

  it('dá ids estáveis às ações e mantém a ordem das seções', () => {
    const { result } = buildResult(
      output([
        section('skills', 50, { actions: ['Adicione Power BI'] }),
        section('headline', 50, { actions: ['Diga o cargo', 'Inclua SQL'] }),
      ]),
      SOURCE,
    );
    expect(result.sections.map((s) => s.key)).toEqual(['headline', 'skills']);
    expect(result.sections.flatMap((s) => s.actions.map((a) => a.id))).toEqual([
      'headline-1',
      'headline-2',
      'skills-1',
    ]);
  });
});

describe('validateDoneActions', () => {
  const { result } = buildResult(
    output([
      section('headline', 50, { actions: ['A', 'B'] }),
      section('about', 50, { actions: ['C'] }),
    ]),
    SOURCE,
  );

  it('guarda na ordem da tela, sem repetir', () => {
    expect(validateDoneActions(result, ['about-1', 'headline-2', 'about-1'])).toEqual([
      'headline-2',
      'about-1',
    ]);
  });

  it('recusa ação desconhecida e análise sem resultado', () => {
    expect(() => validateDoneActions(result, ['inventada'])).toThrow(/desconhecida/);
    expect(() => validateDoneActions(null, [])).toThrow(/ainda não terminou/);
  });
});
