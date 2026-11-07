import { describe, expect, it } from 'vitest';
import type { ProfileFact } from '../../profile';
import { computeCompatibility, namedTerms, tokenize, type MatchInput } from './compatibility';

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

  describe('requisitos em frases, como nas vagas reais', () => {
    const facts = [
      skill('TypeScript'),
      skill('React'),
      skill('Node.js'),
      skill('Python'),
      fact({ name: 'Inglês', level: 'avançado' }),
    ];
    const status = (text: string) => statuses({ job: job({ mustHave: [text] }), facts })[0];

    it('frase com exemplos: um termo basta', () => {
      expect(
        status(
          'Proficiency in a wide range of programming languages and frameworks, including but not limited to .Net, C/C++, Flutter, Python, Node.js, and React.',
        ),
      ).toBe('met');
    });

    it('não confunde o resto da frase com o que é pedido', () => {
      expect(
        status('Conhecimento sólido em Python e no desenvolvimento de soluções automatizadas;'),
      ).toBe('met');
      expect(
        status(
          'Advanced English proficiency, capable of engaging in technical discussions and documentation.',
        ),
      ).toBe('met');
    });

    it('opções que a pessoa não tem continuam não encontradas', () => {
      expect(
        status('Experience with cloud platforms such as AWS, Azure, or Google Cloud is essential.'),
      ).toBe('missing');
      expect(
        status('Experience with containerization technologies such as Docker and Kubernetes.'),
      ).toBe('missing');
    });

    it('sem opções, faltar uma tecnologia deixa parcial', () => {
      expect(status('Experiência sólida com React e Kubernetes em ambientes de produção')).toBe(
        'partial',
      );
    });

    it('nome próprio desconhecido também conta', () => {
      expect(status('Experiência com Robot Framework em automação de testes funcionais')).toBe(
        'missing',
      );
    });

    it('frase sem nada comparável não pesa contra a pessoa', () => {
      for (const text of [
        'Excellent communication skills, with the ability to convey complex technical concepts to non-technical stakeholders.',
        'Perfil analítico, organizado, colaborativo e orientado à resolução de problemas;',
        'Problem Solving: strong analytical abilities to troubleshoot complex multi-layered issues',
      ]) {
        expect(status(text)).toBe('unverified');
      }
    });

    it('tempo de experiência em frase continua parcial', () => {
      expect(status('5+ years of experience building products with React and TypeScript')).toBe(
        'partial',
      );
    });

    it('Java continua sem casar com JavaScript em frases', () => {
      expect(
        statuses({
          job: job({ mustHave: ['Experiência sólida no desenvolvimento de sistemas com Java'] }),
          facts: [skill('JavaScript')],
        }),
      ).toEqual(['missing']);
    });

    it('a empresa em que a pessoa trabalhou não comprova requisito em frase', () => {
      expect(
        statuses({
          job: job({
            mustHave: ['Experience with cloud platforms such as AWS or Azure in production'],
          }),
          facts: [fact({ company: 'AWS', title: 'Vendedora' })],
        }),
      ).toEqual(['missing']);
    });

    it('um perfil que tem a stack pedida recebe uma nota que faz sentido', () => {
      const { score } = computeCompatibility({
        job: job({
          mustHave: [
            'Proficiency in programming languages, including Python, Node.js, and React.',
            'Excellent communication skills with non-technical stakeholders across the company.',
            'Advanced English proficiency, capable of engaging in technical discussions.',
            'Experience with containerization technologies such as Docker and Kubernetes.',
          ],
        }),
        facts,
      });
      // Duas de três comparáveis. A comunicação não conta para nenhum lado.
      expect(score).toBe(67);
    });
  });

  describe('namedTerms', () => {
    it('acha tecnologias conhecidas em minúsculas e nomes no meio da frase', () => {
      expect(namedTerms('experiência com docker e Locust em produção')).toEqual([
        'docker',
        'locust',
      ]);
    });

    it('junta nomes de mais de uma palavra', () => {
      expect(namedTerms('Experience with Google Cloud Platform and ci/cd pipelines')).toEqual([
        'gcp',
        'cicd',
      ]);
    });

    it('a primeira palavra e títulos curtos não são nomes', () => {
      expect(namedTerms('Liderança técnica de times')).toEqual([]);
      expect(namedTerms('Problem Solving: strong analytical skills')).toEqual([]);
    });

    it('sigla no meio da frase conta', () => {
      expect(namedTerms('Experiência com APIs REST e Go')).toEqual(['apis', 'rest', 'go']);
    });
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
