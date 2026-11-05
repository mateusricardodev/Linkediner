import { describe, expect, it } from 'vitest';
import type { ScoreResult } from '../domain/score';
import type { ProfileFact } from '../domain/facts';
import type { StoredScore } from './ports/score-repository';
import { ProfileScoreService } from './score-service';

const USER = 'u1';

function setup(initialFacts: ProfileFact[] = []) {
  const facts = [...initialFacts];
  const stored: StoredScore[] = [];
  let clock = 0;
  const service = new ProfileScoreService(
    {
      getOrCreateProfile: async () => ({
        id: 'p1',
        headline: null,
        summary: null,
        yearsExperience: null,
      }),
      listLinks: async () => [],
      listGoals: async () => [],
    },
    { list: async () => facts },
    {
      history: async (_u, limit) => [...stored].reverse().slice(0, limit),
      append: async (_u, _p, score: ScoreResult) => {
        const row = { ...score, createdAt: new Date(++clock) };
        stored.push(row);
        return row;
      },
    },
  );
  return { service, facts, stored };
}

const project: ProfileFact = {
  id: 'f1',
  type: 'project',
  data: { name: 'P' },
  sourceDocumentId: null,
  sourceSpan: null,
  verification: 'extracted',
  createdAt: new Date(0),
};

describe('ProfileScoreService', () => {
  it('guarda o primeiro cálculo', async () => {
    const { service, stored } = setup();
    const view = await service.recalculate(USER);
    expect(stored).toHaveLength(1);
    expect(view.current.score).toBe(0);
    expect(view.history).toHaveLength(1);
  });

  it('não grava de novo se nada mudou', async () => {
    const { service, stored } = setup();
    await service.recalculate(USER);
    await service.recalculate(USER);
    expect(stored).toHaveLength(1);
  });

  it('grava quando o perfil muda e mostra a evolução em ordem', async () => {
    const { service, facts, stored } = setup();
    await service.recalculate(USER);
    facts.push(project);
    const view = await service.recalculate(USER);
    expect(stored).toHaveLength(2);
    expect(view.current.score).toBe(5);
    expect(view.history.map((h) => h.score)).toEqual([0, 5]);
  });
});
