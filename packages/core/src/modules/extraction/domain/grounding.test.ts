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
    expect(report).toEqual({ accepted: 2, rejectedNoSource: 0, rejectedUnsupportedValue: 0 });
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

  it('descarta invenção escondida atrás de um trecho verdadeiro', () => {
    const invented = [
      { ...experience, company: 'Google' },
      { ...experience, startDate: '2019' },
      { ...experience, description: 'Reduzi o tempo de build em 80%' },
    ];
    const { facts, report } = groundFacts({ ...EMPTY_EXTRACTION, experiences: invented }, DOC);
    expect(facts).toEqual([]);
    expect(report.rejectedUnsupportedValue).toBe(3);
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
