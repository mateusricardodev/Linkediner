import { describe, expect, it } from 'vitest';
import { EMPTY_JOB_OUTPUT, groundJob, jobDedupeHash, validateJobImport } from './job';

const TEXT = `Senior Frontend Engineer na Empresa Fictícia. Remoto (Brasil). CLT. Faixa: R$ 18.000 a R$ 24.000.
Requisitos: 5 anos com React. TypeScript avançado. Desejável: GraphQL.`;

describe('validateJobImport', () => {
  it('apara o texto e normaliza o link', () => {
    expect(validateJobImport({ text: `  ${TEXT}  `, applyUrl: 'empresa.dev/vaga/1' })).toEqual({
      text: TEXT,
      applyUrl: 'https://empresa.dev/vaga/1',
    });
  });

  it('o link é opcional, e link do LinkedIn é aceito só como referência', () => {
    expect(validateJobImport({ text: TEXT }).applyUrl).toBeNull();
    expect(
      validateJobImport({ text: TEXT, applyUrl: 'https://www.linkedin.com/jobs/view/1' }).applyUrl,
    ).toBe('https://www.linkedin.com/jobs/view/1');
  });

  it('rejeita texto curto, texto enorme e link local', () => {
    expect(() => validateJobImport({ text: 'curto' })).toThrow(/texto completo/);
    expect(() => validateJobImport({ text: 'x'.repeat(30_001) })).toThrow(/longo demais/);
    expect(() => validateJobImport({ text: TEXT, applyUrl: 'http://localhost:3000' })).toThrow();
    expect(() => validateJobImport({ text: TEXT, applyUrl: 'javascript:alert(1)' })).toThrow();
  });
});

describe('jobDedupeHash', () => {
  it('ignora capitalização e espaços, mas distingue textos diferentes', () => {
    expect(jobDedupeHash('Vaga  de   React')).toBe(jobDedupeHash('vaga de react'));
    expect(jobDedupeHash('Vaga de React')).not.toBe(jobDedupeHash('Vaga de Vue'));
  });
});

describe('groundJob', () => {
  it('mantém os valores que estão no texto', () => {
    const { fields, report } = groundJob(
      {
        ...EMPTY_JOB_OUTPUT,
        title: 'Senior Frontend Engineer',
        company: 'Empresa Fictícia',
        location: 'Remoto (Brasil)',
        employmentType: 'CLT',
        salaryText: 'R$ 18.000 a R$ 24.000',
        remotePolicy: 'remote',
        seniority: 'senior',
        mustHave: ['5 anos com React', 'TypeScript avançado'],
        niceToHave: ['GraphQL'],
      },
      TEXT,
    );
    expect(report).toEqual({ discardedValues: 0, discardedRequirements: 0 });
    expect(fields).toMatchObject({
      title: 'Senior Frontend Engineer',
      salaryText: 'R$ 18.000 a R$ 24.000',
      remotePolicy: 'remote',
      seniority: 'senior',
      mustHave: ['5 anos com React', 'TypeScript avançado'],
      niceToHave: ['GraphQL'],
    });
  });

  it('descarta valores e requisitos inventados', () => {
    const { fields, report } = groundJob(
      {
        ...EMPTY_JOB_OUTPUT,
        company: 'Google',
        salaryText: 'R$ 50.000',
        mustHave: ['5 anos com React', 'Kubernetes'],
        niceToHave: ['Doutorado'],
      },
      TEXT,
    );
    expect(fields.company).toBeNull();
    expect(fields.salaryText).toBeNull();
    expect(fields.mustHave).toEqual(['5 anos com React']);
    expect(fields.niceToHave).toEqual([]);
    expect(report).toEqual({ discardedValues: 2, discardedRequirements: 2 });
  });

  it('senioridade desconhecida vira nulo', () => {
    expect(groundJob(EMPTY_JOB_OUTPUT, TEXT).fields.seniority).toBeNull();
  });
});
