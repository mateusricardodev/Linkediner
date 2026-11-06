import { describe, expect, it } from 'vitest';
import type { ProfileFact } from '../../profile';
import {
  buildMaterial,
  materialItems,
  pendingInMaterials,
  validateQuestions,
  type ApplicationMaterial,
  type CoverLetterContent,
  type FormAnswersContent,
} from './material';

const fact: ProfileFact = {
  id: 'e1',
  type: 'experience',
  data: { company: 'Nubank', title: 'Engenheira', description: 'Reduzi o build em 40% com React' },
  sourceDocumentId: null,
  sourceSpan: null,
  verification: 'extracted',
  createdAt: new Date(0),
};
const job = { title: 'Frontend Sênior', company: 'Empresa Fictícia' };

const letter = (text: string, factIds = ['e1']) =>
  buildMaterial({
    kind: 'cover_letter',
    output: { paragraphs: [{ text, factIds }] },
    facts: [fact],
    job,
    questions: [],
  });
const first = (r: ReturnType<typeof letter>) => (r.content as CoverLetterContent).paragraphs[0]!;

describe('carta de apresentação', () => {
  it('pode citar a empresa e o cargo da vaga', () => {
    const item = first(letter('Quero atuar na Empresa Fictícia como Frontend Sênior.'));
    expect(item.status).toBe('grounded');
  });

  it('número ou tecnologia fora dos fatos vira sugestão', () => {
    expect(first(letter('Reduzi o build em 90%.')).status).toBe('suggested');
    expect(first(letter('Tenho experiência com kubernetes.')).status).toBe('suggested');
  });

  it('o requisito da vaga não comprova nada: ele não entra na conferência', () => {
    const result = buildMaterial({
      kind: 'cover_letter',
      output: { paragraphs: [{ text: 'Tenho experiência com GraphQL.', factIds: ['e1'] }] },
      facts: [fact],
      job,
      questions: [],
    });
    expect((result.content as CoverLetterContent).paragraphs[0]?.status).toBe('suggested');
  });

  it('o cargo da vaga pode ser citado, mas uma tecnologia dele não vira experiência', () => {
    const build = (text: string) =>
      buildMaterial({
        kind: 'cover_letter',
        output: { paragraphs: [{ text, factIds: ['e1'] }] },
        facts: [fact],
        job: { title: 'Dev Kubernetes', company: null },
        questions: [],
      });
    expect(first(build('Quero a vaga de Dev Kubernetes.')).status).toBe('grounded');
    expect(first(build('Tenho experiência com Kubernetes.')).status).toBe('suggested');
  });

  it('o nome da empresa da vaga sozinho não sustenta a frase: exige um fato citado', () => {
    expect(first(letter('Quero atuar na Empresa Fictícia.', []))).toMatchObject({
      status: 'suggested',
      reason: 'no_source',
    });
  });

  it('fato recusado não comprova', () => {
    const result = buildMaterial({
      kind: 'cover_letter',
      output: { paragraphs: [{ text: 'Reduzi o build em 40%.', factIds: ['e1'] }] },
      facts: [{ ...fact, verification: 'rejected' }],
      job,
      questions: [],
    });
    expect((result.content as CoverLetterContent).paragraphs[0]?.status).toBe('suggested');
  });
});

describe('respostas de formulário', () => {
  const questions = ['Qual sua experiência com React?', 'Qual sua pretensão salarial?'];

  it('pergunta sem resposta fica para a pessoa, e nunca é inventada', () => {
    const { content, report } = buildMaterial({
      kind: 'form_answers',
      output: { answers: [{ questionIndex: 0, text: 'Usei React na Nubank.', factIds: ['e1'] }] },
      facts: [fact],
      job,
      questions,
    });
    const { answers } = content as FormAnswersContent;
    expect(answers[0]).toMatchObject({ question: questions[0], answer: { status: 'grounded' } });
    expect(answers[1]).toEqual({ question: questions[1], answer: null });
    expect(report).toEqual({ grounded: 1, suggested: 0, unanswered: 1 });
  });

  it('ignora resposta para pergunta que não existe', () => {
    const { content } = buildMaterial({
      kind: 'form_answers',
      output: { answers: [{ questionIndex: 9, text: 'Inventada', factIds: ['e1'] }] },
      facts: [fact],
      job,
      questions: ['Uma pergunta?'],
    });
    expect((content as FormAnswersContent).answers).toEqual([
      { question: 'Uma pergunta?', answer: null },
    ]);
  });
});

describe('currículo por vaga', () => {
  it('usa a mesma montagem: dados da experiência vêm dos fatos', () => {
    const { content, report } = buildMaterial({
      kind: 'resume',
      output: {
        summary: [],
        bullets: [{ text: 'Reduzi o build em 40%', factIds: ['e1'], experienceFactId: 'e1' }],
      },
      facts: [fact],
      job,
      questions: [],
    });
    expect(report.grounded).toBe(1);
    expect(materialItems('resume', content)).toHaveLength(1);
  });
});

describe('validateQuestions', () => {
  it('exige perguntas só para o formulário, com limites', () => {
    expect(validateQuestions('cover_letter', [])).toEqual([]);
    expect(() => validateQuestions('form_answers', ['  '])).toThrow(/perguntas/);
    expect(() => validateQuestions('form_answers', Array(21).fill('p'))).toThrow(/até 20/);
    expect(() => validateQuestions('form_answers', ['x'.repeat(501)])).toThrow(/longa/);
    expect(validateQuestions('form_answers', [' Por quê? '])).toEqual(['Por quê?']);
  });
});

describe('pendingInMaterials', () => {
  it('conta sugestões em todos os materiais', () => {
    const material = (kind: ApplicationMaterial['kind'], content: unknown) =>
      ({ id: kind, kind, content }) as ApplicationMaterial;
    const suggested = first(letter('Reduzi em 90%.'));
    expect(
      pendingInMaterials([
        material('cover_letter', { paragraphs: [suggested] }),
        material('form_answers', {
          answers: [
            { question: 'p', answer: suggested },
            { question: 'q', answer: null },
          ],
        }),
        material('resume', null),
      ]),
    ).toBe(2);
  });
});
