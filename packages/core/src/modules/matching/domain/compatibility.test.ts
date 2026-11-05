import { describe, expect, it } from 'vitest';
import type { ProfileFact } from '../../profile';
import { computeCompatibility, tokenize, type MatchInput } from './compatibility';

let nextId = 0;
const fact = (
  data: Record<string, string | null>,
  verification: ProfileFact['verification'] = 'extracted',
) => ({ id: `f${nextId++}`, data, verification });
const skill = (name: string) => fact({ name });

const job = (o: Partial<MatchInput['job']> = {}): MatchInput['job'] => ({
  mustHave: [],
  niceToHave: [],
  seniority: null,
  remotePolicy: null,
  ...o,
});
const statuses = (input: MatchInput) =>
  computeCompatibility(input).requirements.map((r) => r.status);

describe('tokenize', () => {
  it('normaliza acentos e sinônimos', () => {
    expect(tokenize('Node, JS e Inglês')).toEqual(['node.js', 'javascript', 'e', 'ingles']);
  });

  it('preserva nomes com símbolos e ignora números soltos', () => {
    expect(tokenize('C++, C#, Node.js e 5 anos.')).toEqual(['c++', 'c#', 'node.js', 'e', 'anos']);
  });
});

describe('requisitos', () => {
  it('encontra o requisito pelos termos, ignorando palavras genéricas', () => {
    const input = {
      job: job({ mustHave: ['Experiência sólida com React'] }),
      facts: [skill('React')],
    };
    expect(statuses(input)).toEqual(['met']);
  });

  it('Java não casa com JavaScript', () => {
    const input = { job: job({ mustHave: ['Java'] }), facts: [skill('JavaScript')] };
    expect(statuses(input)).toEqual(['missing']);
  });

  it('reconhece nomes diferentes da mesma tecnologia', () => {
    const input = {
      job: job({ mustHave: ['Node e Postgres'] }),
      facts: [skill('NodeJS'), skill('PostgreSQL')],
    };
    expect(statuses(input)).toEqual(['met']);
  });

  it('parte dos termos conta como parcial, e menos da metade como ausente', () => {
    const facts = [skill('React')];
    expect(statuses({ job: job({ mustHave: ['React e Vue'] }), facts })).toEqual(['partial']);
    expect(statuses({ job: job({ mustHave: ['React, Vue, Angular'] }), facts })).toEqual([
      'missing',
    ]);
  });

  it('tempo de experiência não pode ser confirmado: fica parcial', () => {
    const input = { job: job({ mustHave: ['5 anos com React'] }), facts: [skill('React')] };
    expect(statuses(input)).toEqual(['partial']);
    expect(computeCompatibility(input).recommendations.join(' ')).toMatch(/tempo de experiência/);
  });

  it('requisito sem termo comparável não pesa contra a pessoa', () => {
    const input = {
      job: job({ mustHave: ['5 anos de experiência', 'React'] }),
      facts: [skill('React')],
    };
    const result = computeCompatibility(input);
    expect(result.requirements[0]?.status).toBe('unverified');
    expect(result.score).toBe(100);
  });

  it('a empresa em que a pessoa trabalhou não comprova o requisito', () => {
    const input = {
      job: job({ mustHave: ['Google'] }),
      facts: [fact({ company: 'Google', title: 'Engenheira' })],
    };
    expect(statuses(input)).toEqual(['missing']);
  });

  it('fatos recusados e sugestões não contam', () => {
    const input = {
      job: job({ mustHave: ['React', 'Vue'] }),
      facts: [fact({ name: 'React' }, 'rejected'), fact({ name: 'Vue' }, 'suggested')],
    };
    expect(statuses(input)).toEqual(['missing', 'missing']);
  });

  it('liga cada requisito aos fatos que o sustentam', () => {
    const react = skill('React');
    const result = computeCompatibility({
      job: job({ mustHave: ['React'] }),
      facts: [react, skill('Vue')],
    });
    expect(result.requirements[0]?.factIds).toEqual([react.id]);
  });
});

describe('score', () => {
  it('sem requisitos na vaga, não há número', () => {
    const result = computeCompatibility({
      job: job({ seniority: 'senior' }),
      facts: [skill('React')],
      goal: { seniority: 'senior', remoteOnly: true },
    });
    expect(result.score).toBeNull();
  });

  it('tudo atendido vale 100, e nada atendido vale 0', () => {
    const j = job({ mustHave: ['React'], niceToHave: ['GraphQL'] });
    expect(computeCompatibility({ job: j, facts: [skill('React'), skill('GraphQL')] }).score).toBe(
      100,
    );
    expect(computeCompatibility({ job: j, facts: [] }).score).toBe(0);
  });

  it('critério sem dados fica fora: o score é proporcional aos demais', () => {
    const result = computeCompatibility({
      job: job({ mustHave: ['React'] }),
      facts: [skill('React')],
    });
    expect(result.factors.map((f) => f.criterion)).toEqual(['must_have']);
    expect(result.score).toBe(100);
  });

  it('combina os pesos dos critérios', () => {
    const result = computeCompatibility({
      job: job({
        mustHave: ['React', 'Vue'],
        niceToHave: ['GraphQL'],
        seniority: 'senior',
        remotePolicy: 'onsite',
      }),
      facts: [skill('React'), skill('GraphQL')],
      goal: { seniority: 'senior', remoteOnly: true },
    });
    // Obrigatórios 30/60, desejáveis 15/15, nível 15/15, modelo 0/10.
    expect(result.score).toBe(60);
    expect(result.factors.find((f) => f.criterion === 'work_model')?.kind).toBe('gap');
  });

  it('nível vizinho vale metade, e distante vale zero', () => {
    const facts = [skill('React')];
    const points = (seniority: 'mid' | 'junior') =>
      computeCompatibility({
        job: job({ mustHave: ['React'], seniority }),
        facts,
        goal: { seniority: 'senior', remoteOnly: false },
      }).factors.find((f) => f.criterion === 'seniority')?.points;
    expect(points('mid')).toBe(8);
    expect(points('junior')).toBe(0);
  });

  it('sem objetivo remoto, o modelo de trabalho não entra na conta', () => {
    const result = computeCompatibility({
      job: job({ mustHave: ['React'], remotePolicy: 'onsite' }),
      facts: [skill('React')],
      goal: { seniority: 'senior', remoteOnly: false },
    });
    expect(result.factors.map((f) => f.criterion)).toEqual(['must_have']);
  });

  it('é determinístico', () => {
    const input = { job: job({ mustHave: ['React', '5 anos com Vue'] }), facts: [skill('React')] };
    expect(computeCompatibility(input)).toEqual(computeCompatibility(input));
  });

  it('o texto das lacunas não afirma que a pessoa não tem a habilidade', () => {
    const result = computeCompatibility({ job: job({ mustHave: ['Vue'] }), facts: [] });
    expect(result.recommendations.join(' ')).toMatch(/Use só o que for verdadeiro/);
    expect(result.factors[0]?.label).toMatch(/no perfil/);
  });
});
