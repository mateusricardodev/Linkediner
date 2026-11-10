import { describe, expect, it } from 'vitest';
import type { ProfileFact } from '../../profile';
import {
  buildResume,
  collectCorrections,
  mergeCorrections,
  findItem,
  findUnsupportedTerms,
  type Resume,
  type ResumeItem,
  type ResumeOutput,
} from './resume';

const fact = (
  id: string,
  type: ProfileFact['type'],
  data: Record<string, string | null>,
  verification: ProfileFact['verification'] = 'extracted',
): ProfileFact => ({
  id,
  type,
  data,
  verification,
  sourceDocumentId: null,
  sourceSpan: null,
  createdAt: new Date(0),
});

const experience = fact('e1', 'experience', {
  company: 'Nubank',
  title: 'Engenheira Frontend',
  startDate: 'jan 2021',
  endDate: null,
  location: 'Remoto',
  description: 'Migrei o app para React e reduzi o build em 40%',
});
const skill = fact('s1', 'skill', { name: 'TypeScript' });
const facts = [experience, skill];

const output = (o: Partial<ResumeOutput> = {}): ResumeOutput => ({
  summary: [],
  bullets: [],
  ...o,
});
const bullet = (text: string, factIds = ['e1']) => ({ text, factIds, experienceFactId: 'e1' });
const firstBullet = (o: ResumeOutput) => buildResume(o, facts).content.experiences[0]!.bullets[0]!;

describe('findUnsupportedTerms', () => {
  it('aceita frase sustentada pelos fatos, mesmo com outras palavras', () => {
    expect(findUnsupportedTerms('Reduzi o build em 40% na Nubank.', [experience])).toEqual([]);
  });

  it('não considera a primeira palavra da frase um nome próprio', () => {
    expect(findUnsupportedTerms('Liderei a migração. Melhorei o build.', [experience])).toEqual([]);
  });

  it('acusa número, empresa e tecnologia sem comprovação', () => {
    expect(findUnsupportedTerms('Reduzi o build em 80%', [experience])).toEqual(['80']);
    expect(findUnsupportedTerms('Trabalhei no Google', [experience])).toEqual(['Google']);
    expect(findUnsupportedTerms('usei kubernetes no projeto', [experience])).toEqual([
      'kubernetes',
    ]);
  });

  it('um valor só comprova a frase se estiver nos fatos citados, não em outro', () => {
    expect(findUnsupportedTerms('Usei TypeScript no app', [experience])).toContain('TypeScript');
    expect(findUnsupportedTerms('Usei TypeScript no app', [experience, skill])).toEqual([]);
  });
});

describe('findUnsupportedTerms em inglês', () => {
  const pt = [{ data: { title: 'Desenvolvedora Backend', description: 'APIs em Node.js' } }];
  it('aceita a palavra de cargo traduzida, mas não um nível que os fatos não têm', () => {
    expect(findUnsupportedTerms('Experienced Backend Developer with Node.js.', pt)).toEqual([]);
    expect(findUnsupportedTerms('Experienced Senior Developer with Node.js.', pt)).toEqual([
      'Senior',
    ]);
  });
});

describe('buildResume', () => {
  it('copia empresa, cargo e datas dos fatos, em vez de confiar na IA', () => {
    const { content } = buildResume(output(), facts);
    expect(content.experiences[0]).toMatchObject({
      factId: 'e1',
      company: 'Nubank',
      title: 'Engenheira Frontend',
      startDate: 'jan 2021',
      location: 'Remoto',
    });
    expect(content.skills).toEqual(['TypeScript']);
  });

  it('marca como comprovada a frase sustentada', () => {
    expect(firstBullet(output({ bullets: [bullet('Reduzi o build em 40%')] }))).toMatchObject({
      status: 'grounded',
      reason: null,
      factIds: ['e1'],
    });
  });

  it('frase com valor inventado vira sugestão, nunca fato', () => {
    expect(firstBullet(output({ bullets: [bullet('Reduzi o build em 90%')] }))).toMatchObject({
      status: 'suggested',
      reason: 'unsupported_value',
    });
  });

  it('frase sem fato citado ou citando fato inexistente vira sugestão', () => {
    for (const ids of [[], ['nao-existe']]) {
      expect(firstBullet(output({ bullets: [bullet('Liderei o time', ids)] }))).toMatchObject({
        status: 'suggested',
        reason: 'no_source',
        factIds: [],
      });
    }
  });

  it('tópico de experiência inexistente é descartado e contado', () => {
    const { content, report } = buildResume(
      output({ bullets: [{ text: 'X', factIds: ['e1'], experienceFactId: 'inventada' }] }),
      facts,
    );
    expect(content.experiences[0]!.bullets).toEqual([]);
    expect(report.discardedBullets).toBe(1);
  });

  it('fatos recusados não entram nem comprovam frases', () => {
    const rejected = fact('r1', 'skill', { name: 'COBOL' }, 'rejected');
    const { content } = buildResume(
      output({ bullets: [{ ...bullet('Usei COBOL'), factIds: ['r1'] }] }),
      [...facts, rejected],
    );
    expect(content.skills).toEqual(['TypeScript']);
    expect(content.experiences[0]!.bullets[0]).toMatchObject({ status: 'suggested' });
  });

  it('o relatório só traz contagens', () => {
    const { report } = buildResume(
      output({
        summary: [{ text: 'Sou engenheira', factIds: ['e1'] }],
        bullets: [bullet('Reduzi em 90%')],
      }),
      facts,
    );
    expect(report).toEqual({ grounded: 1, suggested: 1, discardedBullets: 0 });
  });

  it('encontra uma frase pelo ID, no resumo ou nas experiências', () => {
    const { content } = buildResume(
      output({
        summary: [{ text: 'Sou engenheira', factIds: ['e1'] }],
        bullets: [bullet('Reduzi em 40%')],
      }),
      facts,
    );
    expect(findItem(content, content.summary[0]!.id)?.text).toBe('Sou engenheira');
    expect(findItem(content, content.experiences[0]!.bullets[0]!.id)?.text).toBe('Reduzi em 40%');
    expect(findItem(content, 'nao-existe')).toBeUndefined();
  });
});

describe('collectCorrections', () => {
  const item = (text: string, o: Partial<ResumeItem> = {}): ResumeItem => ({
    id: text,
    text,
    factIds: [],
    status: 'grounded',
    reason: null,
    ...o,
  });
  const resume = (id: string, day: number, bullets: ResumeItem[]): Resume => ({
    id,
    status: 'draft',
    failureCode: null,
    language: 'pt',
    jobId: null,
    approvedAt: null,
    createdAt: new Date(day * 86_400_000),
    content: {
      summary: [],
      experiences: [
        {
          factId: 'e1',
          company: null,
          title: null,
          startDate: null,
          endDate: null,
          location: null,
          bullets,
        },
      ],
      skills: [],
      education: [],
      certifications: [],
      projects: [],
      languages: [],
    },
  });

  it('pega as correções mais recentes primeiro, sem repetir e sem o currículo atual', () => {
    const old = resume('a', 1, [
      item('Fiz um sistema', { status: 'removed' }),
      item('Criei a API de pagamentos', { originalText: 'Responsável pela API' }),
    ]);
    const recent = resume('b', 2, [
      item('fiz um sistema', { status: 'removed' }),
      item('Liderei 3 pessoas', { originalText: 'Gerenciei uma equipe', status: 'user_confirmed' }),
      item('Igual', { originalText: 'Igual' }),
    ]);
    const current = resume('c', 3, [item('Atual', { status: 'removed' })]);
    expect(collectCorrections([old, recent, current], 'c')).toEqual({
      edited: [
        { before: 'Gerenciei uma equipe', after: 'Liderei 3 pessoas' },
        { before: 'Responsável pela API', after: 'Criei a API de pagamentos' },
      ],
      removed: ['fiz um sistema'],
    });
  });

  it('frase corrigida e depois removida conta como removida, com o texto gerado', () => {
    const r = resume('a', 1, [
      item('Versão minha', { originalText: 'Versão da IA', status: 'removed' }),
    ]);
    expect(collectCorrections([r], 'x')).toEqual({ edited: [], removed: ['Versão da IA'] });
  });

  it('respeita o limite de cada tipo', () => {
    const bullets = Array.from({ length: 15 }, (_, i) => item(`Frase ${i}`, { status: 'removed' }));
    expect(collectCorrections([resume('a', 1, bullets)], 'x', 10).removed).toHaveLength(10);
  });
});

describe('mergeCorrections', () => {
  it('junta as listas na ordem, sem repetir e dentro do limite', () => {
    const recent = { edited: [{ before: 'A', after: 'A2' }], removed: ['X'] };
    const old = {
      edited: [
        { before: 'a', after: 'outra' },
        { before: 'B', after: 'B2' },
      ],
      removed: ['x', 'Y'],
    };
    expect(mergeCorrections([recent, null, old], 10)).toEqual({
      edited: [
        { before: 'A', after: 'A2' },
        { before: 'B', after: 'B2' },
      ],
      removed: ['X', 'Y'],
    });
    expect(mergeCorrections([old], 1)).toEqual({
      edited: [{ before: 'a', after: 'outra' }],
      removed: ['x'],
    });
  });
});
