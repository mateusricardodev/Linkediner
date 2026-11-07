import { describe, expect, it } from 'vitest';
import { buildFactData, describeFact } from './facts';

describe('describeFact', () => {
  it('descreve uma experiência sem inventar período', () => {
    expect(
      describeFact({
        type: 'experience',
        data: { title: 'Dev', company: 'Acme', startDate: '2020', endDate: null, location: null },
      }),
    ).toEqual({ title: 'Dev em Acme', meta: '2020', body: null });
  });

  it('junta início e fim quando os dois existem', () => {
    expect(
      describeFact({
        type: 'education',
        data: { institution: 'USP', degree: 'Bacharelado', startDate: '2015', endDate: '2019' },
      }),
    ).toMatchObject({ title: 'USP', meta: 'Bacharelado · 2015 – 2019' });
  });
});

describe('buildFactData', () => {
  it('apara o texto e transforma campo vazio em nulo, enviando todos os campos', () => {
    expect(buildFactData('language', { name: ' Inglês ', level: '  ' })).toEqual({
      data: { name: 'Inglês', level: null },
      missing: [],
    });
  });

  it('aponta os campos obrigatórios que faltam', () => {
    expect(buildFactData('experience', { title: 'Dev', company: ' ' }).missing).toEqual([
      'Empresa',
    ]);
  });
});
