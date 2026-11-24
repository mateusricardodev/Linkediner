import { describe, expect, it } from 'vitest';
import {
  blockReason,
  chosenJobId,
  generateBlock,
  parseStep,
  pendingFacts,
  provenFacts,
  type WizardContext,
} from './resume-wizard';

const ctx = (o: Partial<WizardContext> = {}): WizardContext => ({
  job: { mode: 'general' },
  jobs: [],
  dirty: false,
  facts: [],
  ...o,
});

describe('blockReason', () => {
  it('sem vaga, segue direto', () => {
    expect(blockReason('vaga', ctx())).toBeNull();
  });

  it('pede a vaga escolhida ou colada, e espera a leitura terminar', () => {
    expect(blockReason('vaga', ctx({ job: { mode: 'saved', jobId: null } }))).toMatch(/Escolha/);
    expect(blockReason('vaga', ctx({ job: { mode: 'pasted', jobId: null } }))).toMatch(/Cole/);
    const job = { mode: 'pasted' as const, jobId: 'j1' };
    expect(blockReason('vaga', ctx({ job, jobs: [{ id: 'j1', status: 'structuring' }] }))).toMatch(
      /Espere/,
    );
    expect(blockReason('vaga', ctx({ job, jobs: [{ id: 'j1', status: 'failed' }] }))).toMatch(
      /Não conseguimos/,
    );
    expect(blockReason('vaga', ctx({ job, jobs: [{ id: 'j1', status: 'ready' }] }))).toBeNull();
  });

  it('com alterações não salvas, segura as etapas de dados', () => {
    for (const step of ['dados', 'mais', 'extra'] as const) {
      expect(blockReason(step, ctx({ dirty: true }))).toMatch(/Salve/);
      expect(blockReason(step, ctx())).toBeNull();
    }
    expect(blockReason('idioma', ctx({ dirty: true }))).toBeNull();
  });
});

describe('fatos', () => {
  const facts = [
    { type: 'experience' as const, verification: 'extracted' as const },
    { type: 'experience' as const, verification: 'suggested' as const },
    { type: 'skill' as const, verification: 'user_confirmed' as const },
    { type: 'experience' as const, verification: 'rejected' as const },
  ];

  it('separa o que já entra do que espera confirmação', () => {
    expect(provenFacts(facts)).toHaveLength(2);
    expect(pendingFacts(facts)).toHaveLength(1);
  });

  it('só gera com uma experiência comprovada', () => {
    expect(generateBlock({ facts })).toBeNull();
    expect(generateBlock({ facts: facts.slice(1) })).toMatch(/experiência/);
  });
});

describe('etapa e vaga', () => {
  it('lê a etapa da URL e cai na primeira quando não existe', () => {
    expect(parseStep('extra')).toBe('extra');
    expect(parseStep('modelo')).toBe('vaga');
    expect(parseStep(null)).toBe('vaga');
  });

  it('currículo geral vai sem vaga', () => {
    expect(chosenJobId({ mode: 'general' })).toBeNull();
    expect(chosenJobId({ mode: 'saved', jobId: 'j1' })).toBe('j1');
  });
});
