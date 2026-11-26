import { describe, expect, it, vi } from 'vitest';
import type { DiscoveryItem } from './discovery-service';
import {
  DailySelectionService,
  dayKey,
  selectPicks,
  type DailyPicksRepository,
  type DailySnapshot,
} from './daily-selection';

const posting = (
  id: string,
  over: Partial<DiscoveryItem['posting']> = {},
): DiscoveryItem['posting'] => ({
  id,
  title: `Vaga ${id}`,
  company: `Empresa ${id}`,
  location: 'Remoto',
  remoteHint: true,
  applyUrl: `https://exemplo.com/${id}`,
  postedAt: new Date('2026-11-20T00:00:00Z'),
  rawText: '',
  sourceKey: 'himalayas',
  structured: true,
  fields: {
    employmentType: null,
    salaryText: null,
    remotePolicy: 'remote',
    seniority: null,
    mustHave: [],
    niceToHave: [],
  },
  ...over,
});

const item = (
  id: string,
  score: number | null,
  over: Partial<DiscoveryItem['posting']> = {},
): DiscoveryItem => ({
  posting: posting(id, over),
  score,
  explanation: [`motivo ${id}`],
});

describe('dayKey', () => {
  it('usa o dia em UTC', () => {
    expect(dayKey(new Date('2026-11-24T23:30:00Z'))).toBe('2026-11-24');
  });
});

describe('selectPicks', () => {
  it('ordena pela maior compatibilidade e deixa as sem nota no fim', () => {
    const picks = selectPicks([item('a', 40), item('b', 90), item('c', null), item('d', 70)]);
    expect(picks.map((p) => p.postingId)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('traz no máximo 5', () => {
    const picks = selectPicks(Array.from({ length: 8 }, (_, i) => item(`j${i}`, 90 - i)));
    expect(picks).toHaveLength(5);
  });

  it('junta a mesma vaga publicada em duas comunidades, ficando a de maior nota', () => {
    const dup = { title: 'Dev Backend', company: 'Acme' };
    const picks = selectPicks([item('x', 50, dup), item('y', 88, dup), item('z', 60)]);
    expect(picks.map((p) => p.postingId)).toEqual(['y', 'z']);
  });

  it('converte a data para ISO', () => {
    const [pick] = selectPicks([item('a', 80)]);
    expect(pick!.postedAt).toBe('2026-11-20T00:00:00.000Z');
  });
});

const repo = (
  stored: DailySnapshot | null = null,
): DailyPicksRepository & { saved: DailySnapshot[] } => {
  const saved: DailySnapshot[] = [];
  return {
    saved,
    find: vi.fn(async () => stored),
    save: vi.fn(async (_u, _d, _g, snapshot) => {
      saved.push(snapshot);
    }),
  };
};

const now = () => new Date('2026-11-24T10:00:00Z');

describe('DailySelectionService.today', () => {
  it('calcula e guarda na primeira visita', async () => {
    const r = repo();
    const discovery = {
      collect: vi.fn(async () => ({
        state: 'ready' as const,
        goal: { id: 'g1', title: 'Backend' },
        items: [item('a', 90), item('b', 40)],
        lastSyncedAt: new Date('2026-11-24T06:00:00Z'),
      })),
    };
    const service = new DailySelectionService(discovery, r, now);
    const result = await service.today('u1');

    expect(result.state).toBe('ready');
    if (result.state !== 'ready') throw new Error('estado inesperado');
    expect(result.picks.map((p) => p.postingId)).toEqual(['a', 'b']);
    expect(r.save).toHaveBeenCalledOnce();
  });

  it('devolve o snapshot guardado sem recalcular', async () => {
    const stored: DailySnapshot = {
      goal: { id: 'g1', title: 'Backend' },
      picks: [
        {
          postingId: 'z',
          title: 'Z',
          company: 'C',
          location: '',
          source: 's',
          applyUrl: 'https://x/z',
          postedAt: null,
          score: 77,
          explanation: [],
        },
      ],
      lastSyncedAt: null,
    };
    const r = repo(stored);
    const discovery = { collect: vi.fn() };
    const service = new DailySelectionService(discovery, r, now);
    const result = await service.today('u1');

    expect(discovery.collect).not.toHaveBeenCalled();
    if (result.state !== 'ready') throw new Error('estado inesperado');
    expect(result.picks[0]!.postingId).toBe('z');
    expect(result.day).toBe('2026-11-24');
  });

  it('não guarda um dia sem vaga', async () => {
    const r = repo();
    const discovery = {
      collect: vi.fn(async () => ({
        state: 'ready' as const,
        goal: { id: 'g1', title: 'Backend' },
        items: [],
        lastSyncedAt: null,
      })),
    };
    const result = await new DailySelectionService(discovery, r, now).today('u1');
    expect(r.save).not.toHaveBeenCalled();
    if (result.state !== 'ready') throw new Error('estado inesperado');
    expect(result.picks).toHaveLength(0);
  });

  it('repassa o estado quando a descoberta não está pronta', async () => {
    const r = repo();
    const discovery = {
      collect: vi.fn(async () => ({ state: 'needs_goal' as const, lastSyncedAt: null })),
    };
    const result = await new DailySelectionService(discovery, r, now).today('u1');
    expect(result.state).toBe('needs_goal');
    expect(r.save).not.toHaveBeenCalled();
  });
});
