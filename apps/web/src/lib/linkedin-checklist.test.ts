import { describe, expect, it } from 'vitest';
import { CHECKLIST, headlineExample } from './linkedin-checklist';

const fact = (type: 'experience' | 'skill', data: Record<string, string | null>) => ({
  type,
  data,
  verification: 'extracted' as const,
});

describe('headlineExample', () => {
  it('junta o cargo mais recente às três primeiras competências comprovadas', () => {
    expect(
      headlineExample([
        fact('experience', {
          title: 'Desenvolvedora Backend Pleno',
          startDate: '2021',
          endDate: null,
        }),
        fact('skill', { name: 'Node.js' }),
        fact('skill', { name: 'PostgreSQL' }),
        fact('skill', { name: 'Redis' }),
        fact('skill', { name: 'Docker' }),
        { ...fact('skill', { name: 'Recusada' }), verification: 'rejected' as const },
      ]),
    ).toBe('Desenvolvedora Backend · Node.js · PostgreSQL · Redis');
  });

  it('sem experiência comprovada, não inventa um exemplo', () => {
    expect(headlineExample([fact('skill', { name: 'Go' })])).toBeNull();
  });
});

describe('CHECKLIST', () => {
  it('tem os mesmos itens que a API aceita, sem repetir', () => {
    const ids = CHECKLIST.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'open_to_work',
      'custom_url',
      'headline',
      'about',
      'skills',
      'job_preferences',
      'photo',
    ]);
  });
});
