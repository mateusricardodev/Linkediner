import { describe, expect, it, vi } from 'vitest';
import { FakeAiProvider, structureJobV1, type AiGenerationRecord } from '../../ai';
import { EMPTY_JOB_OUTPUT, type Job, type JobOutput } from '../domain/job';
import type { JobRepository } from './ports/job-repository';
import { JobService } from './job-service';
import { StructureJob } from './structure-job';

const USER = 'u1';
const TEXT =
  'Engenheira Frontend na Empresa Fictícia. Requisitos: React. Contato: rh@empresa.example ou (11) 91234-5678.';

function memoryRepo(initial: Job[] = []) {
  const rows = new Map(initial.map((j) => [j.id, j]));
  const hashes = new Map<string, string>();
  const repo: JobRepository = {
    insert: async (_u, job) => {
      if (hashes.has(job.dedupeHash)) return null;
      hashes.set(job.dedupeHash, job.id);
      const row: Job = {
        id: job.id,
        source: 'manual',
        status: 'structuring',
        failureCode: null,
        rawText: job.rawText,
        applyUrl: job.applyUrl,
        createdAt: new Date(0),
        ...EMPTY_JOB_OUTPUT,
        remotePolicy: null,
        seniority: null,
      };
      rows.set(job.id, row);
      return row;
    },
    findByHash: async (_u, hash) => rows.get(hashes.get(hash) ?? '') ?? null,
    find: async (_u, id) => rows.get(id) ?? null,
    list: async () => [...rows.values()],
    saveFields: async (_u, id, fields) => {
      rows.set(id, { ...rows.get(id)!, ...fields, status: 'ready', failureCode: null });
    },
    markStructuring: async (_u, id) => {
      rows.set(id, { ...rows.get(id)!, status: 'structuring', failureCode: null });
    },
    markFailed: async (_u, id, failureCode) => {
      rows.set(id, { ...rows.get(id)!, status: 'failed', failureCode });
    },
    delete: async (_u, id) => rows.delete(id),
  };
  return { repo, rows };
}

const consent = (ai_processing: boolean) => ({
  status: async () => ({ granted: { ai_processing } as never, missingRequired: [] }),
});
const audit = { record: vi.fn(async () => {}) };

describe('JobService', () => {
  function setup(o: { consent?: boolean; queueFails?: boolean } = {}) {
    const { repo, rows } = memoryRepo();
    const enqueue = vi.fn(async () => {
      if (o.queueFails) throw new Error('fila fora');
    });
    const quota = { consume: vi.fn(async () => {}), refund: vi.fn(async () => {}) };
    const service = new JobService(repo, consent(o.consent ?? true), { enqueue }, audit, quota);
    return { service, rows, enqueue, quota };
  }

  it('importa e enfileira só IDs, sem o texto da vaga', async () => {
    const { service, enqueue } = setup();
    const job = await service.import(USER, { text: TEXT });
    expect(job.status).toBe('structuring');
    expect(enqueue).toHaveBeenCalledWith({
      userId: USER,
      jobId: job.id,
      usageId: expect.any(String),
    });
  });

  it('exige o consentimento de IA', async () => {
    const { service, enqueue } = setup({ consent: false });
    await expect(service.import(USER, { text: TEXT })).rejects.toMatchObject({
      code: 'CONSENT_REQUIRED',
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('o mesmo texto não cria outra vaga, não processa de novo e não gasta o limite', async () => {
    const { service, rows: repoSaved, enqueue, quota } = setup();
    const first = await service.import(USER, { text: TEXT });
    repoSaved.set(first.id, { ...repoSaved.get(first.id)!, status: 'ready' });
    const second = await service.import(USER, { text: `  ${TEXT.toUpperCase()} ` });
    expect(second.id).toBe(first.id);
    expect(repoSaved.size).toBe(1);
    expect(enqueue).toHaveBeenCalledOnce();
    expect(quota.consume).toHaveBeenCalledOnce();
  });

  it('importar de novo enquanto a vaga é processada não enfileira outra vez', async () => {
    const { service, enqueue } = setup();
    await service.import(USER, { text: TEXT });
    await service.import(USER, { text: TEXT });
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it('importar de novo uma vaga que falhou tenta outra vez', async () => {
    const { service, rows, enqueue } = setup();
    const first = await service.import(USER, { text: TEXT });
    rows.set(first.id, { ...rows.get(first.id)!, status: 'failed', failureCode: 'x' });
    const second = await service.import(USER, { text: TEXT });
    expect(second).toMatchObject({ status: 'structuring', failureCode: null });
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it('se a fila falhar, marca a vaga como falha e devolve o limite', async () => {
    const { service, rows, quota } = setup({ queueFails: true });
    await expect(service.import(USER, { text: TEXT })).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    });
    expect([...rows.values()][0]).toMatchObject({ status: 'failed' });
    expect(quota.refund).toHaveBeenCalledOnce();
  });
});

describe('StructureJob', () => {
  const job = (status: Job['status'] = 'structuring'): Job => ({
    id: 'j1',
    source: 'manual',
    status,
    failureCode: null,
    rawText: TEXT,
    applyUrl: null,
    createdAt: new Date(0),
    ...EMPTY_JOB_OUTPUT,
    remotePolicy: null,
    seniority: null,
  });

  function setup(o: { consent?: boolean; initial?: Job; output?: JobOutput } = {}) {
    const { repo, rows } = memoryRepo([o.initial ?? job()]);
    const generations: AiGenerationRecord[] = [];
    const ai = new FakeAiProvider().respond(
      'structure_job',
      () =>
        o.output ?? {
          ...EMPTY_JOB_OUTPUT,
          company: 'Empresa Fictícia',
          mustHave: ['React', 'Kubernetes'],
        },
    );
    const refund = vi.fn(async () => {});
    const use = new StructureJob({
      jobs: repo,
      consents: consent(o.consent ?? true),
      ai,
      prompt: structureJobV1,
      quota: { refund },
      generations: {
        record: async (e) => {
          generations.push(e);
        },
      },
      audit,
    });
    const run = (isLastAttempt = false) =>
      use.run({ userId: USER, jobId: 'j1', usageId: 'u1' }, { isLastAttempt });
    return { run, rows, ai, generations, refund };
  }

  it('devolve o limite só quando a análise falha', async () => {
    const ok = setup();
    await ok.run();
    expect(ok.refund).not.toHaveBeenCalled();
    const revoked = setup({ consent: false });
    await expect(revoked.run()).resolves.toBe('failed');
    expect(revoked.refund).toHaveBeenCalledWith(USER, 'job.match', 'job:u1');
  });

  it('grava só o que está no texto e registra modelo, prompt e validação', async () => {
    const { run, rows, generations } = setup();
    await expect(run()).resolves.toBe('ready');
    expect(rows.get('j1')).toMatchObject({
      status: 'ready',
      company: 'Empresa Fictícia',
      mustHave: ['React'],
    });
    expect(generations[0]).toMatchObject({
      task: 'structure_job',
      usage: { promptId: 'structure_job', promptVersion: 1 },
      validation: { discardedRequirements: 1 },
    });
  });

  it('não envia à IA contatos de recrutadores', async () => {
    const { run, ai } = setup();
    await run();
    const sent = String(ai.calls[0]?.promptInput.jobText);
    expect(sent).not.toContain('rh@empresa.example');
    expect(sent).not.toContain('91234-5678');
    expect(sent).toContain('Empresa Fictícia');
  });

  it('sem consentimento, não chama a IA', async () => {
    const { run, rows, ai } = setup({ consent: false });
    await expect(run()).resolves.toBe('failed');
    expect(ai.calls).toHaveLength(0);
    expect(rows.get('j1')?.failureCode).toBe('consent_revoked');
  });

  it('ignora vaga já pronta', async () => {
    const { run, ai } = setup({ initial: job('ready') });
    await expect(run()).resolves.toBe('skipped');
    expect(ai.calls).toHaveLength(0);
  });

  it('erro da IA sobe para a fila e só marca falha na última tentativa', async () => {
    const s = setup();
    s.ai.generateStructured = async () => {
      throw new Error('fora do ar');
    };
    await expect(s.run()).rejects.toThrow('fora do ar');
    expect(s.rows.get('j1')?.status).toBe('structuring');
    await expect(s.run(true)).rejects.toThrow('fora do ar');
    expect(s.rows.get('j1')?.failureCode).toBe('processing_error');
  });
});
