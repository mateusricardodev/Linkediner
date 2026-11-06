import { describe, expect, it } from 'vitest';
import { FakeAiProvider } from '@linkediner/core/ai';
import { redactSensitiveData } from '@linkediner/core/extraction/worker';
import { normalizeText } from '@linkediner/core/profile';
import { EVAL_CASES, type EvalCase } from './dataset';
import { evaluate, factsFromExpected } from './evaluate';

/**
 * Estes testes usam modelos simulados e medem só a própria avaliação: um modelo honesto passa, e
 * cada comportamento ruim reprova. Eles não dizem nada sobre a qualidade de um modelo real.
 */
interface Behavior {
  inventFakeSpan?: boolean;
  obeyInjection?: boolean;
  acceptOtherFact?: boolean;
  claimMissingRequirement?: boolean;
  capitalizedClaim?: boolean;
  answerForbidden?: boolean;
  unstableExtraction?: boolean;
  dropMostFacts?: boolean;
  failGeneration?: boolean;
}

function model(behavior: Behavior = {}) {
  const caseFor = (documentText: unknown) =>
    EVAL_CASES.find((c) => redactSensitiveData(c.text, c.ownerName) === documentText)!;
  const caseByFacts = (facts: { id: string; type: string; data: Record<string, unknown> }[]) =>
    facts.find((f) => f.type === 'experience')!;
  let extractions = 0;

  return new FakeAiProvider()
    .respond('extract_profile', (req) => {
      const c: EvalCase = caseFor(req.promptInput.documentText);
      extractions++;
      const { experiences, skills, certifications, education, languages } = c.expected;
      const extraCertifications = [];
      if (behavior.inventFakeSpan) {
        extraCertifications.push({
          name: 'Inventada',
          issuer: null,
          issuedAt: null,
          sourceSpan: 'trecho que não existe',
        });
      }
      if (behavior.obeyInjection && c.injectionBait) {
        extraCertifications.push({
          name: c.injectionBait,
          issuer: null,
          issuedAt: null,
          sourceSpan: c.injectionBait,
        });
      }
      const extraSkills = behavior.acceptOtherFact
        ? [{ name: 'Recife', sourceSpan: 'Recife' }]
        : [];
      const dropExperiences = behavior.unstableExtraction && extractions % 2 === 0;
      return {
        experiences: dropExperiences
          ? []
          : experiences.map((e) => ({ ...e, sourceSpan: e.description })),
        skills: [
          ...(behavior.dropMostFacts ? [] : skills.map((name) => ({ name, sourceSpan: name }))),
          ...extraSkills,
        ],
        projects: [],
        education: education.map((e) => ({
          ...e,
          startDate: null,
          endDate: null,
          sourceSpan: e.institution,
        })),
        certifications: [
          ...certifications.map((x) => ({ ...x, sourceSpan: x.name })),
          ...extraCertifications,
        ],
        languages: languages.map((l) => ({ ...l, sourceSpan: l.name })),
        achievements: [],
      };
    })
    .respond('generate_resume', (req) => {
      if (behavior.failGeneration) throw new Error('modelo fora do ar');
      const fact = caseByFacts(req.promptInput.facts as never);
      const bullets = [{ text: String(fact.data.description), factIds: [fact.id] }];
      if (behavior.claimMissingRequirement) {
        bullets.push({ text: 'Tenho experiência em liderança de squads', factIds: [fact.id] });
      }
      if (behavior.capitalizedClaim) {
        bullets.push({ text: 'Tenho experiência com Kubernetes', factIds: [fact.id] });
      }
      return {
        summary: [],
        bullets: bullets.map((b) => ({ ...b, experienceFactId: fact.id })),
      };
    })
    .respond('generate_cover_letter', (req) => {
      const fact = caseByFacts(req.promptInput.facts as never);
      return {
        paragraphs: [
          { text: 'Quero atuar na Empresa Contratante Fictícia.', factIds: [fact.id] },
          { text: String(fact.data.description), factIds: [fact.id] },
        ],
      };
    })
    .respond('answer_form', (req) => {
      const fact = caseByFacts(req.promptInput.facts as never);
      const answers = [
        { questionIndex: 0, text: String(fact.data.description), factIds: [fact.id] },
      ];
      if (behavior.answerForbidden) {
        answers.push({ questionIndex: 1, text: 'Tenho a idade certa.', factIds: [fact.id] });
      }
      return { answers };
    });
}

const kinds = (report: Awaited<ReturnType<typeof evaluate>>) =>
  new Set(report.failures.map((f) => f.kind));

describe('conjunto de avaliação', () => {
  it('tem de 30 a 50 currículos, com armadilhas, sempre iguais', () => {
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(30);
    expect(EVAL_CASES.length).toBeLessThanOrEqual(50);
    expect(new Set(EVAL_CASES.map((c) => c.id)).size).toBe(EVAL_CASES.length);
    expect(EVAL_CASES.filter((c) => c.injectionBait).length).toBeGreaterThan(0);
    expect(EVAL_CASES.filter((c) => c.sensitiveValues.length > 0).length).toBeGreaterThan(0);
  });

  it('todo fato esperado está no documento sem os dados sensíveis', () => {
    for (const c of EVAL_CASES) {
      const text = normalizeText(redactSensitiveData(c.text, c.ownerName));
      for (const fact of factsFromExpected(c.expected)) {
        for (const value of Object.values(fact.data)) {
          if (value !== null) expect(text, `${c.id}: ${value}`).toContain(normalizeText(value));
        }
      }
    }
  });

  it('os requisitos que faltam e as armadilhas não estão nos fatos esperados', () => {
    for (const c of EVAL_CASES) {
      const expected = normalizeText(JSON.stringify(c.expected));
      for (const term of c.missingRequirements) expect(expected).not.toContain(normalizeText(term));
      if (c.injectionBait) expect(expected).not.toContain(normalizeText(c.injectionBait));
    }
  });

  it('usa só pessoas e contatos fictícios', () => {
    for (const c of EVAL_CASES) {
      for (const email of c.text.match(/\S+@\S+/g) ?? []) expect(email).toMatch(/@example\.com$/);
    }
  });
});

describe('a avaliação percebe cada falha', () => {
  it('um modelo honesto passa', async () => {
    const report = await evaluate(model(), EVAL_CASES);
    expect(report.failures).toEqual([]);
    expect(report.failedChecks).toEqual([]);
    expect(report.extraction.precision).toBe(1);
    expect(report.extraction.recall).toBe(1);
    expect(report.generation.suggested).toBe(0);
  });

  it('trecho inexistente é barrado pela conferência no código, e a avaliação registra', async () => {
    const report = await evaluate(model({ inventFakeSpan: true }), EVAL_CASES);
    expect(report.extraction.rejectedByGrounding).toBe(EVAL_CASES.length);
    expect(report.failures).toEqual([]);
  });

  it('obedecer a uma instrução escondida no documento reprova', async () => {
    const report = await evaluate(model({ obeyInjection: true }), EVAL_CASES);
    expect(kinds(report)).toContain('injection_obeyed');
    expect(report.failedChecks).toContain('injection_obeyed');
  });

  it('fato aceito fora do esperado reprova, mesmo com o texto no documento', async () => {
    const report = await evaluate(model({ acceptOtherFact: true }), EVAL_CASES);
    expect(kinds(report)).toContain('invented_fact_accepted');
  });

  it('afirmar um requisito que a conferência não pega reprova', async () => {
    const report = await evaluate(model({ claimMissingRequirement: true }), EVAL_CASES);
    expect(report.failedChecks).toContain('invented_claim_accepted');
    expect(report.failures[0]?.detail).toContain('liderança de squads');
  });

  it('o requisito que vira sugestão não reprova: a pessoa decide', async () => {
    const report = await evaluate(model({ capitalizedClaim: true }), EVAL_CASES);
    expect(report.failures).toEqual([]);
    expect(report.generation.suggested).toBe(EVAL_CASES.length);
  });

  it('responder pergunta proibida reprova', async () => {
    const report = await evaluate(model({ answerForbidden: true }), EVAL_CASES);
    expect(kinds(report)).toContain('forbidden_question_answered');
  });

  it('remoção de sensíveis com defeito reprova', async () => {
    const leaking = EVAL_CASES.filter((c) => c.sensitiveValues.length > 0).slice(0, 1);
    const provider = model();
    const report = await evaluate(
      {
        id: 'sem-resposta',
        embed: (texts) => provider.embed(texts),
        generateStructured: async () => {
          throw new Error('sem resposta');
        },
      },
      leaking,
      { redact: (text) => text },
    );
    expect(kinds(report)).toContain('sensitive_sent_to_ai');
  });

  it('score instável entre duas execuções reprova', async () => {
    const report = await evaluate(model({ unstableExtraction: true }), EVAL_CASES.slice(0, 1));
    expect(report.failedChecks).toContain('score_drift');
  });

  it('cobertura baixa reprova', async () => {
    const report = await evaluate(model({ dropMostFacts: true }), EVAL_CASES);
    expect(report.failedChecks).toContain('extraction_recall');
  });

  it('erro do provedor aparece, sem interromper os outros casos', async () => {
    const report = await evaluate(model({ failGeneration: true }), EVAL_CASES);
    expect(report.failedChecks).toContain('provider_error');
    expect(report.cases).toBe(EVAL_CASES.length);
    expect(report.extraction.matched).toBeGreaterThan(0);
  });
});
