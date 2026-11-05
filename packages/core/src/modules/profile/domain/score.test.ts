import { describe, expect, it } from 'vitest';
import type { FactType, FactVerification } from './facts';
import {
  computeProfileScore,
  hasMetric,
  RUBRIC_V1_WEIGHTS,
  type CriterionId,
  type ScoreInput,
} from './score';

let nextId = 0;
const fact = (
  type: FactType,
  data: Record<string, string | null> = {},
  verification: FactVerification = 'extracted',
) => ({ id: `f${nextId++}`, type, data, verification });

const empty: ScoreInput = {
  profile: { headline: null, summary: null },
  links: [],
  goals: [],
  facts: [],
};

const complete: ScoreInput = {
  profile: { headline: 'Engenheira', summary: 'Resumo' },
  links: [{ kind: 'github' }, { kind: 'linkedin' }, { kind: 'portfolio' }],
  goals: [{ isActive: true }],
  facts: [
    fact('experience', { startDate: 'jan 2021', description: 'Reduzi custos em 40%' }),
    fact('experience', { startDate: '2018', description: 'Atendi 1200 clientes' }),
    ...Array.from({ length: 8 }, (_, i) => fact('skill', { name: `s${i}` })),
    fact('education', { institution: 'USP' }),
    fact('project', { name: 'P' }),
    fact('language', { name: 'Inglês' }),
  ],
};

const factor = (input: ScoreInput, criterion: CriterionId) =>
  computeProfileScore(input).factors.find((f) => f.criterion === criterion)!;

describe('computeProfileScore', () => {
  it('os pesos da rubrica somam 100', () => {
    expect(Object.values(RUBRIC_V1_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('perfil vazio vale 0 e todo critério traz uma recomendação', () => {
    const result = computeProfileScore(empty);
    expect(result.score).toBe(0);
    expect(result.rubricVersion).toBe('v1');
    for (const f of result.factors) {
      expect(f.kind).toBe('gap');
      expect(f.recommendation).toBeTruthy();
    }
  });

  it('perfil completo vale 100, sem recomendações', () => {
    const result = computeProfileScore(complete);
    expect(result.score).toBe(100);
    for (const f of result.factors) {
      expect(f.kind).toBe('positive');
      expect(f.recommendation).toBeNull();
    }
  });

  it('é determinístico e a soma dos fatores é o score', () => {
    const a = computeProfileScore(complete);
    expect(computeProfileScore(complete)).toEqual(a);
    expect(a.factors.reduce((t, f) => t + f.points, 0)).toBe(a.score);
  });

  it('nunca passa dos pontos máximos, mesmo com excesso de fatos', () => {
    const many = {
      ...empty,
      facts: Array.from({ length: 50 }, (_, i) => fact('skill', { name: `s${i}` })),
    };
    expect(factor(many, 'skills').points).toBe(RUBRIC_V1_WEIGHTS.skills);
  });

  it('fatos recusados e sugestões não confirmadas não contam', () => {
    const input = {
      ...empty,
      facts: [
        fact('skill', { name: 'A' }, 'rejected'),
        fact('skill', { name: 'B' }, 'suggested'),
        fact('project', { name: 'C' }, 'suggested'),
      ],
    };
    expect(computeProfileScore(input).score).toBe(0);
    const confirmed = { ...empty, facts: [fact('project', { name: 'C' }, 'user_confirmed')] };
    expect(factor(confirmed, 'projects').points).toBe(RUBRIC_V1_WEIGHTS.projects);
  });

  it('liga cada critério aos fatos que o sustentam', () => {
    const experience = fact('experience', { startDate: null, description: 'Fiz 3 entregas' });
    const input = { ...empty, facts: [experience, fact('skill', { name: 'TS' })] };
    expect(factor(input, 'experience').factIds).toEqual([experience.id]);
    expect(factor(input, 'experience_dates').factIds).toEqual([]);
    expect(factor(input, 'measurable_results').factIds).toEqual([experience.id]);
  });

  it('não penaliza por idade: o ano das datas não muda o score', () => {
    const at = (year: string) => ({
      ...empty,
      facts: [
        fact('experience', { startDate: year, description: 'Liderei o time' }),
        fact('education', { institution: 'USP', endDate: year }),
      ],
    });
    expect(computeProfileScore(at('1985')).score).toBe(computeProfileScore(at('2024')).score);
  });

  it('ignora atributos sensíveis mesmo que apareçam nos dados', () => {
    const sensitive = {
      ...complete,
      profile: {
        ...complete.profile,
        age: 58,
        gender: 'feminino',
        race: 'parda',
        disability: 'sim',
      },
    } as ScoreInput;
    expect(computeProfileScore(sensitive)).toEqual(computeProfileScore(complete));
  });

  it('pontua links conforme o que é verificável', () => {
    const github = { ...empty, links: [{ kind: 'github' as const }] };
    expect(factor(github, 'links').points).toBe(5);
    const other = { ...empty, links: [{ kind: 'other' as const }] };
    expect(factor(other, 'links').points).toBe(0);
  });

  it('objetivo inativo não conta', () => {
    expect(factor({ ...empty, goals: [{ isActive: false }] }, 'goal').points).toBe(0);
  });

  it('crédito parcial aparece como lacuna, com recomendação', () => {
    const one = { ...empty, facts: [fact('skill', { name: 'TS' })] };
    const skills = factor(one, 'skills');
    expect(skills).toMatchObject({ kind: 'gap', points: 2, maxPoints: 15 });
    expect(skills.recommendation).toBeTruthy();
  });

  it('os textos não trazem o conteúdo dos fatos', () => {
    const input = {
      ...empty,
      facts: [fact('experience', { company: 'Empresa Secreta', description: 'Fiz 3 entregas' })],
    };
    expect(JSON.stringify(computeProfileScore(input))).not.toContain('Empresa Secreta');
  });
});

describe('hasMetric', () => {
  it.each([
    ['Reduzi custos em 40%', true],
    ['Atendi 1200 clientes', true],
    ['Trabalhei lá desde 2021', false],
    ['De 1998 a 2004', false],
    ['Liderei o time', false],
    ['', false],
    [null, false],
  ])('%s => %s', (text, expected) => {
    expect(hasMetric(text)).toBe(expected);
  });
});
