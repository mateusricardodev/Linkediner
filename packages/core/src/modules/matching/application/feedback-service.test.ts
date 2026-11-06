import { describe, expect, it, vi } from 'vitest';
import type { Job } from '../../jobs';
import type { FeedbackRecord } from '../domain/preferences';
import { FeedbackService, type FeedbackRepository } from './feedback-service';

const USER = 'u1';

const job = (id: string, o: Partial<Job> = {}): Job => ({
  id,
  source: 'manual',
  status: 'ready',
  failureCode: null,
  rawText: 'texto',
  applyUrl: null,
  title: id,
  company: 'Empresa A',
  location: null,
  employmentType: null,
  salaryText: null,
  remotePolicy: 'remote',
  seniority: null,
  mustHave: ['React'],
  niceToHave: [],
  createdAt: new Date(0),
  ...o,
});

function setup(
  jobs: Job[],
  facts: { name: string }[] = [{ name: 'React' }],
  applications: { jobId: string | null; submittedAt: Date | null }[] = [],
) {
  const stored: FeedbackRecord[] = [];
  const repo: FeedbackRepository = {
    list: async () => stored,
    replace: async (_u, jobId, records) => {
      for (let i = stored.length - 1; i >= 0; i--) {
        if (stored[i]!.jobId === jobId) stored.splice(i, 1);
      }
      stored.push(...records);
    },
  };
  const record = vi.fn(async () => {});
  const service = new FeedbackService(
    repo,
    { find: async (_u, id) => jobs.find((j) => j.id === id) ?? null, list: async () => jobs },
    {
      list: async () =>
        facts.map((data, i) => ({
          id: `f${i}`,
          type: 'skill' as const,
          data,
          sourceDocumentId: null,
          sourceSpan: null,
          verification: 'extracted' as const,
          createdAt: new Date(0),
        })),
    },
    { listGoals: async () => [] },
    { list: async () => applications },
    { record },
  );
  return { service, record };
}

describe('FeedbackService', () => {
  it('a nova avaliação substitui a anterior, e lista vazia limpa', async () => {
    const { service } = setup([job('a')]);
    await service.set(USER, 'a', ['liked']);
    await service.set(USER, 'a', ['more_like_this']);
    expect(await service.forJob(USER, 'a')).toEqual(['more_like_this']);
    await service.set(USER, 'a', []);
    expect(await service.forJob(USER, 'a')).toEqual([]);
  });

  it('registra só os motivos na auditoria, sem conteúdo da vaga', async () => {
    const { service, record } = setup([job('a')]);
    await service.set(USER, 'a', ['liked', 'liked']);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'job.feedback', metadata: { reasons: ['liked'] } }),
    );
  });

  it('vaga inexistente ou não analisada é recusada', async () => {
    const { service } = setup([job('a', { status: 'structuring' })]);
    await expect(service.set(USER, 'x', ['liked'])).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.set(USER, 'a', ['liked'])).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('recomenda da mais à menos compatível, sem vagas ainda não analisadas', async () => {
    const { service } = setup([
      job('baixa', { mustHave: ['Vue'] }),
      job('alta', { mustHave: ['React'] }),
      job('pendente', { status: 'structuring' }),
    ]);
    const { items, hidden } = await service.recommendations(USER);
    expect(items.map((i) => i.job.id)).toEqual(['alta', 'baixa']);
    expect(hidden).toBe(0);
  });

  it('candidatura enviada tira a vaga da lista. Só salvar não tira', async () => {
    const { service } = setup(
      [job('enviada'), job('salva'), job('livre')],
      [{ name: 'React' }],
      [
        { jobId: 'enviada', submittedAt: new Date(0) },
        { jobId: 'salva', submittedAt: null },
        { jobId: null, submittedAt: new Date(0) },
      ],
    );
    const { items, hidden } = await service.recommendations(USER);
    expect(items.map((i) => i.job.id).sort()).toEqual(['livre', 'salva']);
    expect(hidden).toBe(1);
  });

  it('vaga sem requisitos vai para o fim', async () => {
    const { service } = setup([
      job('sem-requisitos', { mustHave: [] }),
      job('baixa', { mustHave: ['Vue'] }),
    ]);
    const { items } = await service.recommendations(USER);
    expect(items.map((i) => i.job.id)).toEqual(['baixa', 'sem-requisitos']);
    expect(items[1]).toMatchObject({ score: null, rankScore: null });
  });

  it('avaliações mudam a ordem e escondem vagas, mas não mudam o score', async () => {
    const { service } = setup([
      job('a', { company: 'Empresa A', mustHave: ['Vue', 'React'] }),
      job('b', { company: 'Empresa B', mustHave: ['Rust', 'React'] }),
      job('c', { company: 'Empresa C', mustHave: ['React'] }),
      job('d', { company: 'Empresa C', mustHave: ['React'] }),
    ]);
    const before = await service.recommendations(USER);
    const scoreOf = (list: typeof before.items, id: string) =>
      list.find((i) => i.job.id === id)?.score;

    await service.set(USER, 'c', ['company_blocked']);
    await service.set(USER, 'b', ['more_like_this']);
    const after = await service.recommendations(USER);

    expect(after.hidden).toBe(2);
    expect(after.items.map((i) => i.job.id)).toEqual(['b', 'a']);
    expect(scoreOf(after.items, 'a')).toBe(scoreOf(before.items, 'a'));
    expect(scoreOf(after.items, 'b')).toBe(scoreOf(before.items, 'b'));
    expect(after.items[0]?.rankScore).toBeGreaterThan(after.items[0]?.score ?? 100);
    expect(after.items[0]?.explanation.length).toBeGreaterThan(0);
  });
});
