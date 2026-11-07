import { describe, expect, it } from 'vitest';
import {
  buildGoalBody,
  EMPTY_GOAL_FORM,
  formFromGoal,
  goalSummary,
  parseList,
  resolveGoal,
} from './goals';
import type { CareerGoal } from './types';

const goal = (id: string, isActive = true): CareerGoal => ({
  id,
  title: 'Frontend sênior',
  seniority: 'senior',
  targetRoles: ['Frontend', 'Fullstack'],
  locations: ['São Paulo'],
  remoteOnly: true,
  salaryMin: 15000,
  currency: 'BRL',
  salaryPeriod: 'month',
  isActive,
  createdAt: '2026-11-07T00:00:00.000Z',
});

describe('parseList', () => {
  it('separa por vírgula ou linha, sem vazios nem repetidos', () => {
    expect(parseList(' Frontend, Fullstack\n\nFrontend ,')).toEqual(['Frontend', 'Fullstack']);
    expect(parseList('   ')).toEqual([]);
  });
});

describe('buildGoalBody', () => {
  const form = { ...EMPTY_GOAL_FORM, title: 'Frontend sênior' };

  it('recusa nome curto ou longo demais', () => {
    expect(buildGoalBody({ ...form, title: ' ab ' }).error).toMatch(/entre 3 e 80/);
    expect(buildGoalBody({ ...form, title: 'x'.repeat(81) }).error).toMatch(/entre 3 e 80/);
  });

  it('sem salário, moeda e período também vão vazios, como a API exige', () => {
    expect(buildGoalBody(form).body).toMatchObject({
      salaryMin: null,
      currency: null,
      salaryPeriod: null,
    });
  });

  it('com salário, os três andam juntos', () => {
    expect(buildGoalBody({ ...form, salaryMin: '15.000', currency: 'USD' }).body).toMatchObject({
      salaryMin: 15000,
      currency: 'USD',
      salaryPeriod: 'month',
    });
  });

  it.each(['abc', '-1', '0', '15,5'])('recusa o salário %s', (salaryMin) => {
    expect(buildGoalBody({ ...form, salaryMin }).error).toMatch(/inteiro positivo/);
  });

  it('respeita os limites das listas', () => {
    const many = Array.from({ length: 11 }, (_, i) => `Cargo ${i}`).join(',');
    expect(buildGoalBody({ ...form, targetRoles: many }).error).toMatch(/até 10 cargos/);
    expect(buildGoalBody({ ...form, locations: 'x'.repeat(61) }).error).toMatch(/60 caracteres/);
  });
});

describe('formFromGoal', () => {
  it('ida e volta não muda o objetivo', () => {
    const { id: _i, createdAt: _c, isActive: _a, ...expected } = goal('a');
    expect(buildGoalBody(formFromGoal(goal('a'))).body).toEqual(expected);
  });
});

describe('goalSummary', () => {
  it('resume o que foi informado', () => {
    expect(goalSummary(goal('a'))).toBe(
      'Sênior · Só remoto · Frontend, Fullstack · São Paulo · a partir de BRL 15.000 por mês',
    );
  });

  it('omite o que não foi informado', () => {
    expect(
      goalSummary({
        ...goal('a'),
        targetRoles: [],
        locations: [],
        remoteOnly: false,
        salaryMin: null,
        currency: null,
        salaryPeriod: null,
      }),
    ).toBe('Sênior');
  });
});

describe('resolveGoal', () => {
  it('usa o escolhido, se ainda estiver ativo', () => {
    expect(resolveGoal([goal('a'), goal('b')], 'b')?.id).toBe('b');
  });

  it('sem escolha válida, usa o primeiro ativo, como a API', () => {
    expect(resolveGoal([goal('a', false), goal('b')], 'a')?.id).toBe('b');
    expect(resolveGoal([goal('a'), goal('b')], 'apagado')?.id).toBe('a');
    expect(resolveGoal([goal('a'), goal('b')], null)?.id).toBe('a');
  });

  it('sem objetivo ativo, não há o que usar', () => {
    expect(resolveGoal([goal('a', false)], null)).toBeNull();
    expect(resolveGoal([], null)).toBeNull();
  });
});
