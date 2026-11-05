import { isDeepStrictEqual } from 'node:util';
import { computeProfileScore, type ScoreResult } from '../domain/score';
import type { FactRepository } from './ports/fact-repository';
import type { ProfileRepository } from './ports/profile-repository';
import type { ScoreRepository, StoredScore } from './ports/score-repository';

const HISTORY_LIMIT = 30;

export interface ProfileScoreView {
  current: StoredScore;
  /** Do mais antigo para o mais recente, para desenhar a evolução. */
  history: { score: number; createdAt: Date }[];
}

const sameResult = (a: ScoreResult, b: ScoreResult) =>
  a.score === b.score &&
  a.rubricVersion === b.rubricVersion &&
  isDeepStrictEqual(a.factors, b.factors);

/**
 * Calcula o score a partir dos dados atuais e guarda uma nova linha só se o resultado mudou.
 * É seguro chamar a qualquer momento: sem mudança no perfil, nada é gravado.
 */
export class ProfileScoreService {
  constructor(
    private readonly profiles: Pick<
      ProfileRepository,
      'getOrCreateProfile' | 'listLinks' | 'listGoals'
    >,
    private readonly facts: Pick<FactRepository, 'list'>,
    private readonly scores: ScoreRepository,
  ) {}

  async recalculate(userId: string): Promise<ProfileScoreView> {
    const profile = await this.profiles.getOrCreateProfile(userId);
    const [links, goals, facts, history] = await Promise.all([
      this.profiles.listLinks(userId),
      this.profiles.listGoals(userId),
      this.facts.list(userId),
      this.scores.history(userId, HISTORY_LIMIT),
    ]);
    const result = computeProfileScore({ profile, links, goals, facts });

    const latest = history[0];
    const current =
      latest && sameResult(latest, result)
        ? latest
        : await this.scores.append(userId, profile.id, result);
    const all = current === latest ? history : [current, ...history].slice(0, HISTORY_LIMIT);

    return {
      current,
      history: all.map(({ score, createdAt }) => ({ score, createdAt })).reverse(),
    };
  }
}
