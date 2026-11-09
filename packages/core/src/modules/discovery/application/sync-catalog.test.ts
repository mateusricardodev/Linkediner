import { describe, expect, it, vi } from 'vitest';
import { FakeAiProvider, structureJobV1 } from '../../ai';
import { AppError } from '../../shared';
import type { ExternalPosting } from '../domain/discovery';
import type { Board, CatalogPosting, JobSourceAdapter } from './ports';
import { StructureCatalog, SyncCatalog } from './sync-catalog';

const board = (o: Partial<Board> = {}): Board => ({
  id: 'b1',
  sourceKey: 'greenhouse',
  token: 'acme',
  company: 'Acme',
  ...o,
});
const posting = (o: Partial<ExternalPosting> = {}): ExternalPosting => ({
  externalId: '1',
  title: 'Backend Engineer',
  location: 'São Paulo',
  remoteHint: false,
  applyUrl: 'https://x.example/1',
  postedAt: null,
  body: 'Texto',
  ...o,
});
const wait = async () => {};

function syncSetup(boards: Board[], adapters: JobSourceAdapter[]) {
  const catalog = {
    activeBoards: vi.fn(async () => boards),
    replacePostings: vi.fn(async (_b: Board, list: ExternalPosting[]) => ({
      inserted: list.length,
      updated: 0,
      removed: 0,
    })),
    markBoard: vi.fn(async () => {}),
  };
  return { catalog, sync: new SyncCatalog({ catalog, adapters, wait, now: () => new Date(0) }) };
}

describe('SyncCatalog', () => {
  it('guarda só o que é de tecnologia e no Brasil', async () => {
    const { catalog, sync } = syncSetup(
      [board()],
      [
        {
          key: 'greenhouse',
          listPostings: async () => [
            posting(),
            posting({ externalId: '2', title: 'Advogado' }),
            posting({ externalId: '3', location: 'Remote, United States', remoteHint: true }),
          ],
        },
      ],
    );
    await expect(sync.run()).resolves.toMatchObject({ boards: 1, failed: 0, inserted: 1 });
    const saved = catalog.replacePostings.mock.calls[0]![1];
    expect(saved.map((p) => p.externalId)).toEqual(['1']);
    expect(catalog.markBoard).toHaveBeenCalledWith('b1', { syncedAt: new Date(0) });
  });

  it('uma empresa com problema não para as outras e não apaga o que já existe', async () => {
    const { catalog, sync } = syncSetup(
      [board({ id: 'ruim', token: 'ruim' }), board({ id: 'boa', token: 'boa' })],
      [
        {
          key: 'greenhouse',
          listPostings: async (token) => {
            if (token === 'ruim') throw new Error('source_status_500');
            return [posting()];
          },
        },
      ],
    );
    await expect(sync.run()).resolves.toMatchObject({ boards: 2, failed: 1, inserted: 1 });
    expect(catalog.replacePostings).toHaveBeenCalledTimes(1);
    expect(catalog.replacePostings.mock.calls[0]![0].id).toBe('boa');
    expect(catalog.markBoard).toHaveBeenCalledWith('ruim', { error: 'source_status_500' });
  });

  it('erro inesperado não vai para o registro com a mensagem original', async () => {
    const { catalog, sync } = syncSetup(
      [board()],
      [
        {
          key: 'greenhouse',
          listPostings: async () => {
            throw new Error('detalhe interno');
          },
        },
      ],
    );
    await sync.run();
    expect(catalog.markBoard).toHaveBeenCalledWith('b1', { error: 'source_invalid_response' });
  });

  it('sem fonte ligada, não chama ninguém', async () => {
    const listPostings = vi.fn(async () => []);
    const { sync } = syncSetup([], [{ key: 'greenhouse', listPostings }]);
    await sync.run();
    expect(listPostings).not.toHaveBeenCalled();
  });
});

const pending = (o: Partial<CatalogPosting> = {}): CatalogPosting => ({
  id: 'p1',
  title: 'Backend Engineer',
  company: 'Acme',
  location: 'São Paulo',
  remoteHint: false,
  applyUrl: 'https://x.example/1',
  postedAt: null,
  rawText:
    'Backend Engineer\nAcme\nSão Paulo\n\nRequisitos: Go e Postgres. Contato: rh@acme.example',
  sourceKey: 'greenhouse',
  structured: false,
  fields: {
    employmentType: null,
    salaryText: null,
    remotePolicy: null,
    seniority: null,
    mustHave: [],
    niceToHave: [],
  },
  ...o,
});
const OUTPUT = {
  title: 'Backend Engineer',
  company: 'Acme',
  location: 'São Paulo',
  employmentType: null,
  salaryText: null,
  remotePolicy: 'hybrid',
  seniority: 'senior',
  mustHave: ['Go', 'Kubernetes'],
  niceToHave: [],
};
const goal = { title: 'Backend', targetRoles: [], locations: [], remoteOnly: false };

function structureSetup(
  o: {
    postings?: CatalogPosting[];
    goals?: (typeof goal)[];
    limit?: number;
    ai?: FakeAiProvider;
  } = {},
) {
  const catalog = {
    pendingPostings: vi.fn(async () => o.postings ?? [pending()]),
    activeGoals: vi.fn(async () => o.goals ?? [goal]),
    saveStructured: vi.fn(async () => {}),
    markStructureFailed: vi.fn(async () => {}),
  };
  const ai = o.ai ?? new FakeAiProvider().respond('structure_job', () => OUTPUT);
  const use = new StructureCatalog({
    catalog,
    ai,
    prompt: structureJobV1,
    wait,
    limit: o.limit ?? 10,
    intervalMs: 0,
  });
  return { catalog, ai, use };
}

describe('StructureCatalog', () => {
  it('confere a resposta contra o texto e registra o modelo', async () => {
    const { catalog, use } = structureSetup();
    await expect(use.run()).resolves.toMatchObject({ structured: 1, failed: 0 });
    expect(catalog.saveStructured).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ seniority: 'senior', mustHave: ['Go'] }),
      { model: 'fake-model', promptVersion: structureJobV1.version },
    );
  });

  it('a IA recebe só o texto da vaga, sem o contato do recrutador', async () => {
    const { ai, use } = structureSetup();
    await use.run();
    const input = JSON.stringify(ai.calls[0]!.promptInput);
    expect(input).toContain('Postgres');
    expect(input).not.toContain('rh@acme.example');
  });

  it('sem objetivo ativo, não gasta nenhuma chamada', async () => {
    const { ai, catalog, use } = structureSetup({ goals: [] });
    await use.run();
    expect(ai.calls).toHaveLength(0);
    expect(catalog.pendingPostings).not.toHaveBeenCalled();
  });

  it('só analisa o que interessa a algum objetivo, até o teto', async () => {
    const { ai, use } = structureSetup({
      postings: [
        pending({ id: 'a', title: 'Frontend Engineer' }),
        pending({ id: 'b' }),
        pending({ id: 'c' }),
        pending({ id: 'd' }),
      ],
      limit: 2,
    });
    await use.run();
    expect(ai.calls).toHaveLength(2);
  });

  it('limite do provedor encerra a rodada e deixa o restante para depois', async () => {
    const ai = new FakeAiProvider().respond('structure_job', () => {
      throw new AppError('DEPENDENCY_UNAVAILABLE', 'limite', { providerStatus: 429 });
    });
    const { catalog, use } = structureSetup({ postings: [pending(), pending({ id: 'b' })], ai });
    await expect(use.run()).resolves.toMatchObject({ stoppedEarly: true, structured: 0 });
    expect(catalog.markStructureFailed).not.toHaveBeenCalled();
    expect(ai.calls).toHaveLength(1);
  });

  it('resposta inválida marca só aquela vaga', async () => {
    const ai = new FakeAiProvider().respond('structure_job', () => ({ errado: true }));
    const { catalog, use } = structureSetup({ ai });
    await expect(use.run()).resolves.toMatchObject({ failed: 1, stoppedEarly: false });
    expect(catalog.markStructureFailed).toHaveBeenCalledWith('p1');
  });
});
