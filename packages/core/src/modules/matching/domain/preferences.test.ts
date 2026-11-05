import { describe, expect, it } from 'vitest';
import {
  learnPreferences,
  rankJob,
  snapshotOf,
  validateFeedback,
  type FeedbackReason,
  type FeedbackRecord,
} from './preferences';

const job = (o: Partial<Parameters<typeof snapshotOf>[0]> = {}) => ({
  company: 'Empresa A',
  seniority: 'senior' as const,
  remotePolicy: 'remote' as const,
  mustHave: ['React'],
  niceToHave: ['GraphQL'],
  ...o,
});
const fb = (reason: FeedbackReason, o: Parameters<typeof job>[0] = {}): FeedbackRecord => ({
  jobId: 'j',
  reason,
  snapshot: snapshotOf(job(o)),
});
const rank = (
  feedback: FeedbackRecord[],
  o: { score?: number | null; job?: Parameters<typeof job>[0]; own?: FeedbackReason[] } = {},
) =>
  rankJob({
    jobId: 'x',
    score: o.score === undefined ? 50 : o.score,
    job: job(o.job),
    preferences: learnPreferences(feedback),
    ownReasons: o.own ?? [],
  });

describe('validateFeedback', () => {
  it('recusa avaliações contraditórias', () => {
    expect(() => validateFeedback(['liked', 'disliked'], job())).toThrow(/contradizem/);
    expect(() => validateFeedback(['more_like_this', 'tech_mismatch'], job())).toThrow();
  });

  it('aceita gostar de uma vaga em que já se candidatou', () => {
    expect(() => validateFeedback(['liked', 'already_applied'], job())).not.toThrow();
  });

  it('só bloqueia empresa quando a vaga a identifica', () => {
    expect(() => validateFeedback(['company_blocked'], job({ company: null }))).toThrow(/empresa/);
  });
});

describe('rankJob', () => {
  it('sem avaliações, a posição é o próprio score', () => {
    expect(rank([])).toEqual({ rankScore: 50, hidden: false, explanation: [] });
  });

  it('avaliar bem sobe vagas parecidas e explica o motivo', () => {
    const result = rank([fb('more_like_this', { mustHave: ['React'], niceToHave: [] })]);
    expect(result.rankScore).toBe(52);
    expect(result.explanation).toEqual(['Pede react, como vagas que você avaliou bem']);
  });

  it('tecnologia incompatível desce vagas com ela', () => {
    const result = rank([fb('tech_mismatch', { mustHave: ['React'], niceToHave: [] })]);
    expect(result.rankScore).toBe(48);
    expect(result.explanation[0]).toMatch(/incompatível/);
  });

  it('empresa bloqueada some em qualquer vaga dela, sem depender de capitalização', () => {
    const result = rank([fb('company_blocked')], { job: { company: 'EMPRESA A' } });
    expect(result.hidden).toBe(true);
    expect(rank([fb('company_blocked')], { job: { company: 'Outra' } }).hidden).toBe(false);
  });

  it.each(['disliked', 'too_senior', 'misaligned', 'salary_mismatch', 'already_applied'] as const)(
    'a própria vaga some com %s',
    (reason) => {
      expect(rank([], { own: [reason] }).hidden).toBe(true);
    },
  );

  it('"muito sênior" desce aquele nível e os acima, mas não os abaixo', () => {
    const feedback = [fb('too_senior', { seniority: 'senior', mustHave: [], niceToHave: [] })];
    expect(rank(feedback, { job: { seniority: 'staff' } }).rankScore).toBe(40);
    expect(rank(feedback, { job: { seniority: 'senior' } }).rankScore).toBe(40);
    expect(rank(feedback, { job: { seniority: 'mid' } }).rankScore).toBe(50);
  });

  it('modelo de trabalho inadequado desce vagas iguais', () => {
    const feedback = [
      fb('location_mismatch', { remotePolicy: 'onsite', mustHave: [], niceToHave: [] }),
    ];
    expect(rank(feedback, { job: { remotePolicy: 'onsite' } }).rankScore).toBe(45);
    expect(rank(feedback, { job: { remotePolicy: 'remote' } }).rankScore).toBe(50);
  });

  it('as preferências têm limite: não anulam a compatibilidade', () => {
    const many = Array.from({ length: 30 }, () => fb('tech_mismatch'));
    expect(rank(many, { score: 80 }).rankScore).toBe(65);
    const liked = Array.from({ length: 30 }, () => fb('liked'));
    expect(rank(liked, { score: 95 }).rankScore).toBe(100);
  });

  it('vaga sem score não recebe posição numérica, mas continua na lista', () => {
    expect(rank([], { score: null })).toMatchObject({ rankScore: null, hidden: false });
  });

  it('a explicação cita no máximo três termos', () => {
    const terms = ['Rust', 'Go', 'Kafka', 'Redis'];
    const feedback = [fb('liked', { mustHave: terms, niceToHave: [] })];
    const { explanation } = rank(feedback, { job: { mustHave: terms, niceToHave: [] } });
    expect(explanation[0]).toBe('Pede go, kafka, redis, como vagas que você avaliou bem');
  });
});

describe('snapshotOf', () => {
  it('guarda termos sem repetição e sem palavras genéricas', () => {
    expect(
      snapshotOf(job({ mustHave: ['Experiência com React', 'React'], niceToHave: ['Node'] })).terms,
    ).toEqual(['react', 'node.js']);
  });
});
