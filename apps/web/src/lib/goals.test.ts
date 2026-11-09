import { describe, expect, it } from 'vitest';
import {
  buildGoalBody,
  EMPTY_GOAL_FORM,
  formFromGoal,
  goalSummary,
  parseList,
  resolveGoal,
  suggestGoal,
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

describe('suggestGoal', () => {
  const experience = (data: Record<string, string | null>, verification = 'extracted') => ({
    type: 'experience' as const,
    verification: verification as 'extracted',
    data,
  });

  it('usa a experiência atual e tira o nível do nome', () => {
    const suggestion = suggestGoal([
      experience({ title: 'Desenvolvedora Junior', startDate: '2019', endDate: '2021' }),
      experience({ title: 'Desenvolvedora Backend Pleno', startDate: '03/2021', endDate: 'atual' }),
    ]);
    expect(suggestion).toMatchObject({
      role: 'Desenvolvedora Backend',
      seniorityFound: true,
      form: {
        title: 'Desenvolvedora Backend',
        targetRoles: 'Desenvolvedora Backend',
        seniority: 'mid',
      },
    });
  });

  it('sem experiência atual, fica a que começou por último, mesmo em formatos diferentes', () => {
    const suggestion = suggestGoal([
      experience({ title: 'Analista de Dados', startDate: 'jan 2020', endDate: 'dez 2022' }),
      experience({ title: 'Senior Data Engineer', startDate: '2023-02', endDate: '2024-06' }),
    ]);
    expect(suggestion).toMatchObject({ role: 'Data Engineer', form: { seniority: 'senior' } });
  });

  it('liderança faz parte do cargo, e sem nível no título a sugestão diz isso', () => {
    expect(
      suggestGoal([experience({ title: 'Tech Lead', startDate: '2022', endDate: null })]),
    ).toMatchObject({
      role: 'Tech Lead',
      form: { seniority: 'lead' },
    });
    expect(
      suggestGoal([
        experience({ title: 'Engenheira de Software', startDate: '2022', endDate: null }),
      ]),
    ).toMatchObject({ seniorityFound: false, form: { seniority: 'mid' } });
  });

  it('ignora experiência recusada ou sem cargo, e sem nenhuma não sugere nada', () => {
    expect(
      suggestGoal([
        experience({ title: 'Cargo recusado', startDate: '2024', endDate: null }, 'rejected'),
        experience({ title: null, startDate: '2024', endDate: null }),
      ]),
    ).toBeNull();
  });
});
