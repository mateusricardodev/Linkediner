import { describe, expect, it } from 'vitest';
import {
  emptyItem,
  initialState,
  isCurrentEnd,
  isDirty,
  planIsEmpty,
  planSave,
  validate,
} from './profile-form';
import type { Profile, ProfileFact } from './types';

const profile: Profile = {
  id: 'p1',
  headline: 'Analista de Dados',
  summary: null,
  location: null,
  industry: null,
  yearsExperience: null,
  linkedinChecklist: [],
  links: [
    { kind: 'linkedin', url: 'https://www.linkedin.com/in/ana' },
    { kind: 'other', url: 'https://blog.exemplo.com' },
  ],
};

const fact = (
  o: Partial<ProfileFact> & Pick<ProfileFact, 'id' | 'type' | 'data'>,
): ProfileFact => ({
  verification: 'extracted',
  sourceDocumentId: null,
  sourceSpan: null,
  createdAt: '2026-11-24T00:00:00.000Z',
  ...o,
});

const experience = fact({
  id: 'f1',
  type: 'experience',
  data: {
    title: 'Analista',
    company: 'Empresa A',
    startDate: '2024',
    endDate: 'Present',
    location: null,
    description: null,
  },
});
const skill = fact({ id: 'f2', type: 'skill', data: { name: 'SQL' } });
const rejected = fact({
  id: 'f3',
  type: 'skill',
  data: { name: 'Cobol' },
  verification: 'rejected',
});
const suggestion = fact({
  id: 'f4',
  type: 'skill',
  data: { name: 'Python' },
  verification: 'suggested',
});

const base = () => initialState('Ana Teste', profile, [experience, skill, rejected, suggestion]);

describe('initialState', () => {
  it('deixa de fora os itens recusados e os links de outros tipos', () => {
    const state = base();
    expect(state.items.map((i) => i.id)).toEqual(['f1', 'f2', 'f4']);
    expect(state.header.links).toEqual({
      linkedin: 'https://www.linkedin.com/in/ana',
      github: '',
      portfolio: '',
    });
    expect(state.otherLinks).toEqual([{ kind: 'other', url: 'https://blog.exemplo.com' }]);
  });
});

describe('planSave', () => {
  it('sem mudanças, não há nada a salvar', () => {
    const plan = planSave(base(), base());
    expect(planIsEmpty(plan)).toBe(true);
    expect(isDirty(base(), base())).toBe(false);
  });

  it('separa o que corrigir, remover, confirmar e criar', () => {
    const baseline = base();
    const state = base();
    state.items[0]!.values.description = 'Montei painéis em Power BI.';
    state.removed = ['f2'];
    state.items = state.items.filter((i) => i.id !== 'f2');
    state.items.find((i) => i.id === 'f4')!.confirm = true;
    state.items.push(emptyItem('skill', { name: 'Python ' }));
    state.items.push(emptyItem('experience'));

    const plan = planSave(baseline, state);
    expect(plan.update).toEqual([
      expect.objectContaining({
        id: 'f1',
        data: expect.objectContaining({ description: 'Montei painéis em Power BI.' }),
      }),
    ]);
    expect(plan.reject).toEqual(['f2']);
    expect(plan.confirm).toEqual(['f4']);
    // Experiência em branco é ignorada; a skill nova vai sem espaços sobrando.
    expect(plan.create).toEqual([
      expect.objectContaining({ type: 'skill', data: { name: 'Python' } }),
    ]);
    expect(isDirty(baseline, state)).toBe(true);
  });

  it('manda o cabeçalho e os links só quando mudam, mantendo os links de outros tipos', () => {
    const baseline = base();
    const state = base();
    state.header.location = ' São José dos Campos ';
    state.header.links.github = 'https://github.com/ana';
    const plan = planSave(baseline, state);
    expect(plan.profile).toEqual({
      headline: 'Analista de Dados',
      summary: null,
      location: 'São José dos Campos',
      industry: null,
    });
    expect(plan.links).toEqual([
      { kind: 'linkedin', url: 'https://www.linkedin.com/in/ana' },
      { kind: 'github', url: 'https://github.com/ana' },
      { kind: 'other', url: 'https://blog.exemplo.com' },
    ]);
    expect(plan.name).toBeNull();
  });
});

describe('validate', () => {
  it('aponta o item e o campo que faltam', () => {
    const state = base();
    state.items.push(emptyItem('experience', { title: 'Estágio' }));
    expect(validate(state)).toBe('Experiência 2: preencha Empresa.');
  });

  it('exige o nome e ignora itens novos em branco', () => {
    const state = base();
    state.items.push(emptyItem('certification'));
    expect(validate(state)).toBeNull();
    state.header.name = '  ';
    expect(validate(state)).toBe('Informe o seu nome completo.');
  });
});

describe('isCurrentEnd', () => {
  it('reconhece o fim de uma experiência atual em português e inglês', () => {
    for (const value of ['Present', 'atual', ' o momento ', 'Current']) {
      expect(isCurrentEnd(value)).toBe(true);
    }
    expect(isCurrentEnd('2024')).toBe(false);
  });
});
