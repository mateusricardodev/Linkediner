import { describe, expect, it } from 'vitest';
import { EMPTY_EXTRACTION, ExtractionOutput, groundFacts } from './grounding';

const DOC = `Experiência
Engenheira Frontend na Nubank, jan 2021 - atual
Liderei a migração do app para React 18, com redução de 40% no tempo de build.
Competências: TypeScript, React
Formação: Ciência da Computação, Universidade de São Paulo`;

const experience = {
  company: 'Nubank',
  title: 'Engenheira Frontend',
  startDate: 'jan 2021',
  endDate: 'atual',
  location: null,
  description: null,
  sourceSpan: 'Engenheira Frontend na Nubank, jan 2021 - atual',
};

describe('groundFacts', () => {
  it('aceita fatos com trecho e valores presentes no documento', () => {
    const { facts, report } = groundFacts(
      {
        ...EMPTY_EXTRACTION,
        experiences: [experience],
        skills: [{ name: 'TypeScript', sourceSpan: 'Competências: TypeScript, React' }],
      },
      DOC,
    );
    expect(report).toEqual({
      accepted: 2,
      rejectedNoSource: 0,
      rejectedUnsupportedValue: 0,
      droppedFields: 0,
    });
    expect(facts[0]).toEqual({
      type: 'experience',
      sourceSpan: experience.sourceSpan,
      data: {
        company: 'Nubank',
        title: 'Engenheira Frontend',
        startDate: 'jan 2021',
        endDate: 'atual',
        location: null,
        description: null,
      },
    });
    expect(facts[1]?.type).toBe('skill');
  });

  it('descarta fato cujo trecho não existe no documento', () => {
    const { facts, report } = groundFacts(
      {
        ...EMPTY_EXTRACTION,
        certifications: [
          {
            name: 'AWS Solutions Architect',
            issuer: null,
            issuedAt: null,
            sourceSpan: 'Certificação AWS Solutions Architect',
          },
        ],
      },
      DOC,
    );
    expect(facts).toEqual([]);
    expect(report.rejectedNoSource).toBe(1);
  });

  it('descarta o fato quando um valor obrigatório foi inventado', () => {
    const invented = [
      { ...experience, company: 'Google' },
      { ...experience, title: 'Diretora de Engenharia' },
    ];
    const { facts, report } = groundFacts({ ...EMPTY_EXTRACTION, experiences: invented }, DOC);
    expect(facts).toEqual([]);
    expect(report.rejectedUnsupportedValue).toBe(2);
    expect(report.droppedFields).toBe(0);
  });

  it('mantém o fato, mas nunca grava um valor opcional inventado', () => {
    const { facts, report } = groundFacts(
      {
        ...EMPTY_EXTRACTION,
        experiences: [
          { ...experience, startDate: '2019', description: 'Reduzi o tempo de build em 80%' },
        ],
      },
      DOC,
    );
    expect(facts[0]?.data).toMatchObject({
      company: 'Nubank',
      startDate: null,
      endDate: 'atual',
      description: null,
    });
    expect(JSON.stringify(facts)).not.toMatch(/2019|80%/);
    expect(report).toMatchObject({ accepted: 1, droppedFields: 2, rejectedUnsupportedValue: 0 });
  });

  it('descarta item cujo único valor foi inventado', () => {
    const { facts, report } = groundFacts(
      {
        ...EMPTY_EXTRACTION,
        skills: [{ name: 'Kubernetes', sourceSpan: 'Competências: TypeScript, React' }],
        achievements: [{ description: 'Ganhei um prêmio', sourceSpan: 'Competências: TypeScript' }],
      },
      DOC,
    );
    expect(facts).toEqual([]);
    expect(report.rejectedUnsupportedValue).toBe(2);
  });

  describe('texto que junta tópicos', () => {
    const BULLETS = `Engenheira Frontend | Empresa Fictícia
• Reduzi o tempo de build em 40% com cache e divisão de pacotes.
• Liderei a migração do aplicativo web para React 18 e TypeScript, mantendo as entregas do time durante
toda a transição.
• Atendi 3 equipes.`;
    const withDescription = (description: string) => ({
      ...EMPTY_EXTRACTION,
      experiences: [
        {
          company: 'Empresa Fictícia',
          title: 'Engenheira Frontend',
          startDate: null,
          endDate: null,
          location: null,
          description,
          sourceSpan: 'Engenheira Frontend | Empresa Fictícia',
        },
      ],
    });

    it('aceita a resposta real do Gemini, com os tópicos unidos por quebra de linha', () => {
      const description =
        'Reduzi o tempo de build em 40% com cache e divisão de pacotes.\nLiderei a migração do aplicativo web para React 18 e TypeScript, mantendo as entregas do time durante toda a transição.';
      const { facts, report } = groundFacts(withDescription(description), BULLETS);
      expect(facts[0]?.data.description).toBe(description);
      expect(report).toMatchObject({ accepted: 1, droppedFields: 0 });
    });

    it('aceita tópicos unidos por espaço e com os marcadores', () => {
      const { report } = groundFacts(
        withDescription(
          'Reduzi o tempo de build em 40% com cache e divisão de pacotes. Liderei a migração do aplicativo web para React 18 e TypeScript, mantendo as entregas do time durante toda a transição.',
        ),
        BULLETS,
      );
      expect(report.droppedFields).toBe(0);
      expect(
        groundFacts(
          withDescription(
            '• Reduzi o tempo de build em 40% com cache e divisão de pacotes.\n• Liderei a migração do aplicativo web para React 18 e TypeScript, mantendo as entregas do time durante toda a transição.',
          ),
          BULLETS,
        ).report.droppedFields,
      ).toBe(0);
    });

    it('um tópico inventado no meio derruba a descrição inteira', () => {
      const { facts, report } = groundFacts(
        withDescription(
          'Reduzi o tempo de build em 40% com cache e divisão de pacotes.\nGanhei um prêmio internacional de engenharia.',
        ),
        BULLETS,
      );
      expect(facts[0]?.data.description).toBeNull();
      expect(report.droppedFields).toBe(1);
    });

    it('não monta uma frase nova com pedaços curtos que existem no documento', () => {
      const { facts } = groundFacts(withDescription('Reduzi\n3 equipes\nem 40%'), BULLETS);
      expect(facts[0]?.data.description).toBeNull();
    });
  });

  it('não acusa invenção por diferenças de acento, maiúscula ou quebra de linha', () => {
    const { report } = groundFacts(
      {
        ...EMPTY_EXTRACTION,
        education: [
          {
            institution: 'UNIVERSIDADE DE SAO PAULO',
            degree: null,
            field: 'ciencia da computacao',
            startDate: null,
            endDate: null,
            sourceSpan: 'Formação:   Ciência da Computação,\nUniversidade de São Paulo',
          },
        ],
      },
      DOC,
    );
    expect(report.accepted).toBe(1);
  });
});

describe('ExtractionOutput', () => {
  it('rejeita item sem trecho de origem', () => {
    const { sourceSpan: _removed, ...semTrecho } = experience;
    const result = ExtractionOutput.safeParse({ ...EMPTY_EXTRACTION, experiences: [semTrecho] });
    expect(result.success).toBe(false);
  });
});
