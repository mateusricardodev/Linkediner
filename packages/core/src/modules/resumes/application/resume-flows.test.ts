import { describe, expect, it, vi } from 'vitest';
import { FakeAiProvider, generateResumeV1, type AiGenerationRecord } from '../../ai';
import type { ProfileFact } from '../../profile';
import { newId } from '../../shared';
import type { Resume, ResumeContent, ResumeOutput } from '../domain/resume';
import { GenerateResume } from './generate-resume';
import type { ResumeRepository } from './ports/resume-repository';
import { ResumeService } from './resume-service';

const USER = 'u1';
const EXPERIENCE: ProfileFact = {
  id: 'e1',
  type: 'experience',
  data: { company: 'Nubank', title: 'Engenheira', description: 'Reduzi o build em 40%' },
  sourceDocumentId: 'd1',
  sourceSpan: 'trecho do documento original',
  verification: 'extracted',
  createdAt: new Date(0),
};

function memoryRepo(initial: Resume[] = []) {
  const rows = new Map(initial.map((r) => [r.id, r]));
  const repo: ResumeRepository = {
    insertGenerating: async (_u, id) => {
      const row: Resume = {
        id,
        status: 'generating',
        content: null,
        failureCode: null,
        approvedAt: null,
        createdAt: new Date(0),
      };
      rows.set(id, row);
      return row;
    },
    find: async (_u, id) => rows.get(id) ?? null,
    list: async () => [...rows.values()],
    saveDraft: async (_u, id, content) => {
      rows.set(id, { ...rows.get(id)!, status: 'draft', content });
    },
    markFailed: async (_u, id, failureCode) => {
      rows.set(id, { ...rows.get(id)!, status: 'failed', failureCode });
    },
    updateContent: async (_u, id, change) => {
      const row = rows.get(id);
      if (!row?.content) return null;
      change(row.content);
      return row;
    },
    approve: async (_u, id, at) => {
      const row = rows.get(id);
      if (row?.status !== 'draft') return null;
      const approved = { ...row, status: 'approved' as const, approvedAt: at };
      rows.set(id, approved);
      return approved;
    },
    delete: async (_u, id) => rows.delete(id),
  };
  return { repo, rows };
}

const consent = (ai_processing: boolean) => ({
  status: async () => ({ granted: { ai_processing } as never, missingRequired: [] }),
});
const audit = { record: vi.fn(async () => {}) };

describe('GenerateResume', () => {
  const generating: Resume = {
    id: 'r1',
    status: 'generating',
    content: null,
    failureCode: null,
    approvedAt: null,
    createdAt: new Date(0),
  };

  function setup(o: { consent?: boolean; facts?: ProfileFact[]; output?: ResumeOutput } = {}) {
    const { repo, rows } = memoryRepo([{ ...generating }]);
    const generations: AiGenerationRecord[] = [];
    const ai = new FakeAiProvider().respond(
      'generate_resume',
      () =>
        o.output ?? {
          summary: [],
          bullets: [
            { text: 'Reduzi o build em 40%', factIds: ['e1'], experienceFactId: 'e1' },
            { text: 'Reduzi custos em 90%', factIds: ['e1'], experienceFactId: 'e1' },
          ],
        },
    );
    const refund = vi.fn(async () => {});
    const use = new GenerateResume({
      resumes: repo,
      facts: { list: async () => o.facts ?? [EXPERIENCE] },
      consents: consent(o.consent ?? true),
      ai,
      prompt: generateResumeV1,
      quota: { refund },
      generations: {
        record: async (e) => {
          generations.push(e);
        },
      },
      audit,
    });
    const run = (isLastAttempt = false) =>
      use.run({ userId: USER, resumeId: 'r1' }, { isLastAttempt });
    return { run, rows, ai, generations, refund };
  }

  it('devolve o limite só quando a geração falha', async () => {
    const ok = setup();
    await ok.run();
    expect(ok.refund).not.toHaveBeenCalled();
    const revoked = setup({ consent: false });
    await revoked.run();
    expect(revoked.refund).toHaveBeenCalledWith(USER, 'resume.improved', 'resume:r1');
  });

  it('gera o rascunho e registra modelo, prompt e validação', async () => {
    const { run, rows, generations } = setup();
    await expect(run()).resolves.toBe('draft');
    const bullets = rows.get('r1')!.content!.experiences[0]!.bullets;
    expect(bullets.map((b) => b.status)).toEqual(['grounded', 'suggested']);
    expect(generations[0]).toMatchObject({
      task: 'generate_resume',
      usage: { promptId: 'generate_resume', promptVersion: 1 },
      validation: { grounded: 1, suggested: 1, discardedBullets: 0 },
    });
  });

  it('envia à IA os fatos, sem os trechos do documento original', async () => {
    const { run, ai } = setup();
    await run();
    expect(JSON.stringify(ai.calls[0]?.promptInput)).not.toContain('trecho do documento');
  });

  it('não chama a IA sem consentimento ou sem fatos', async () => {
    const revoked = setup({ consent: false });
    await expect(revoked.run()).resolves.toBe('failed');
    expect(revoked.rows.get('r1')!.failureCode).toBe('consent_revoked');
    expect(revoked.ai.calls).toHaveLength(0);

    const noFacts = setup({ facts: [{ ...EXPERIENCE, verification: 'rejected' }] });
    await expect(noFacts.run()).resolves.toBe('failed');
    expect(noFacts.rows.get('r1')!.failureCode).toBe('no_facts');
    expect(noFacts.ai.calls).toHaveLength(0);
  });

  it('erro da IA sobe para a fila e só marca falha na última tentativa', async () => {
    const s = setup();
    s.ai.generateStructured = async () => {
      throw new Error('fora do ar');
    };
    await expect(s.run()).rejects.toThrow('fora do ar');
    expect(s.rows.get('r1')!.status).toBe('generating');
    await expect(s.run(true)).rejects.toThrow('fora do ar');
    expect(s.rows.get('r1')!.failureCode).toBe('processing_error');
  });

  it('ignora currículo já gerado ou apagado', async () => {
    const s = setup();
    await s.run();
    s.ai.calls.length = 0;
    await expect(s.run()).resolves.toBe('skipped');
    expect(s.ai.calls).toHaveLength(0);
  });
});

describe('ResumeService', () => {
  const draftContent = (): ResumeContent => ({
    summary: [],
    experiences: [
      {
        factId: 'e1',
        company: 'Nubank',
        title: 'Engenheira',
        startDate: null,
        endDate: null,
        location: null,
        bullets: [
          {
            id: 'b1',
            text: 'Reduzi em 90%',
            factIds: ['e1'],
            status: 'suggested',
            reason: 'unsupported_value',
          },
          { id: 'b2', text: 'Reduzi em 40%', factIds: ['e1'], status: 'grounded', reason: null },
        ],
      },
    ],
    skills: [],
    education: [],
    certifications: [],
    projects: [],
    languages: [],
  });

  function setup(
    o: { consent?: boolean; facts?: ProfileFact[]; queueFails?: boolean; initial?: Resume[] } = {},
  ) {
    const { repo, rows } = memoryRepo(o.initial);
    const addConfirmed = vi.fn(async () => {});
    const enqueue = vi.fn(async () => {
      if (o.queueFails) throw new Error('fila fora');
    });
    const quota = { consume: vi.fn(async () => {}), refund: vi.fn(async () => {}) };
    const service = new ResumeService(
      repo,
      { list: async () => o.facts ?? [EXPERIENCE], addConfirmed },
      consent(o.consent ?? true),
      { enqueue },
      audit,
      quota,
    );
    return { service, rows, addConfirmed, enqueue, quota };
  }
  const draft = (): Resume => ({
    id: 'r1',
    status: 'draft',
    content: draftContent(),
    failureCode: null,
    approvedAt: null,
    createdAt: new Date(0),
  });
  const bulletOf = (r: Resume, i: number) => r.content!.experiences[0]!.bullets[i]!;

  it('enfileira só IDs', async () => {
    const { service, enqueue } = setup();
    const resume = await service.request(USER);
    expect(enqueue).toHaveBeenCalledWith({ userId: USER, resumeId: resume.id });
  });

  it('exige consentimento de IA e fatos comprovados', async () => {
    await expect(setup({ consent: false }).service.request(USER)).rejects.toMatchObject({
      code: 'CONSENT_REQUIRED',
    });
    await expect(setup({ facts: [] }).service.request(USER)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('não dispara duas gerações ao mesmo tempo, nem gasta o limite duas vezes', async () => {
    const { service, enqueue, quota } = setup();
    const first = await service.request(USER);
    const second = await service.request(USER);
    expect(second.id).toBe(first.id);
    expect(enqueue).toHaveBeenCalledOnce();
    expect(quota.consume).toHaveBeenCalledOnce();
  });

  it('se a fila falhar, marca o currículo como falho', async () => {
    const { service, rows } = setup({ queueFails: true });
    await expect(service.request(USER)).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    expect([...rows.values()][0]).toMatchObject({ status: 'failed' });
  });

  it('confirmar uma sugestão a transforma em fato do usuário', async () => {
    const { service, addConfirmed } = setup({ initial: [draft()] });
    const updated = await service.decideItem(USER, 'r1', 'b1', { action: 'confirm' });
    expect(bulletOf(updated, 0)).toMatchObject({ status: 'user_confirmed', reason: null });
    expect(addConfirmed).toHaveBeenCalledWith(USER, {
      type: 'achievement',
      data: { description: 'Reduzi em 90%' },
    });
  });

  it('corrigir o texto guarda a versão do usuário', async () => {
    const { service, addConfirmed } = setup({ initial: [draft()] });
    const updated = await service.decideItem(USER, 'r1', 'b1', {
      action: 'confirm',
      text: 'Reduzi em 30%',
    });
    expect(bulletOf(updated, 0).text).toBe('Reduzi em 30%');
    expect(addConfirmed).toHaveBeenCalledWith(USER, {
      type: 'achievement',
      data: { description: 'Reduzi em 30%' },
    });
  });

  it('confirmar frase já comprovada, sem editar, não cria fato novo', async () => {
    const { service, addConfirmed } = setup({ initial: [draft()] });
    await service.decideItem(USER, 'r1', 'b2', { action: 'confirm' });
    expect(addConfirmed).not.toHaveBeenCalled();
  });

  it('remover uma sugestão não cria fato', async () => {
    const { service, addConfirmed } = setup({ initial: [draft()] });
    const updated = await service.decideItem(USER, 'r1', 'b1', { action: 'remove' });
    expect(bulletOf(updated, 0).status).toBe('removed');
    expect(addConfirmed).not.toHaveBeenCalled();
  });

  it('não aprova com sugestões pendentes e informa quantas faltam', async () => {
    const { service } = setup({ initial: [draft()] });
    await expect(service.approve(USER, 'r1')).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { pendingSuggestions: 1 },
    });
  });

  it('aprova depois de decidir as sugestões, e aprovar de novo não muda nada', async () => {
    const { service } = setup({ initial: [draft()] });
    await service.decideItem(USER, 'r1', 'b1', { action: 'remove' });
    const approved = await service.approve(USER, 'r1');
    expect(approved.status).toBe('approved');
    await expect(service.approve(USER, 'r1')).resolves.toMatchObject({ status: 'approved' });
  });

  it('não aprova currículo que ainda está sendo gerado', async () => {
    const { service } = setup({ initial: [{ ...draft(), status: 'generating', content: null }] });
    await expect(service.approve(USER, 'r1')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('frase ou currículo inexistente devolve 404', async () => {
    const { service } = setup({ initial: [draft()] });
    await expect(
      service.decideItem(USER, 'r1', newId(), { action: 'remove' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      service.decideItem(USER, 'nao-existe', 'b1', { action: 'remove' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
