import type { CareerGoal } from '../../profile';
import {
  dedupeByTitleCompany,
  type DiscoveryItem,
  type DiscoveryService,
} from './discovery-service';

/** Uma vaga do dia: só o que o snapshot guarda, com datas em ISO para não depender de revival. */
export interface DailyPick {
  postingId: string;
  title: string;
  company: string;
  location: string;
  source: string;
  applyUrl: string;
  postedAt: string | null;
  /** Nulo quando a vaga não foi analisada ou não traz requisitos. */
  score: number | null;
  explanation: string[];
}

export interface DailySnapshot {
  goal: Pick<CareerGoal, 'id' | 'title'>;
  picks: DailyPick[];
  lastSyncedAt: string | null;
}

export type DailySelection =
  | { state: 'disabled' }
  | { state: 'upgrade_required' }
  | { state: 'needs_goal'; lastSyncedAt: string | null }
  | ({ state: 'ready'; day: string } & DailySnapshot);

/** Guarda a seleção do dia, para ficar a mesma o dia todo. */
export interface DailyPicksRepository {
  find(userId: string, day: string): Promise<DailySnapshot | null>;
  save(userId: string, day: string, goalId: string, snapshot: DailySnapshot): Promise<void>;
}

/** Quantas vagas o dia traz. São as mais compatíveis; se o catálogo render menos, mostra menos. */
const DAILY_MAX = 5;

/** Dia da seleção, em UTC (AAAA-MM-DD). */
export const dayKey = (now: Date) => now.toISOString().slice(0, 10);

const iso = (date: Date | null) => date?.toISOString() ?? null;

/** As mais compatíveis primeiro; sem nota vão para o fim; empate pela mais recente. */
export const selectPicks = (items: DiscoveryItem[]): DailyPick[] => {
  const ordered = [...items].sort(
    (a, b) =>
      (b.score ?? -1) - (a.score ?? -1) ||
      (b.posting.postedAt?.getTime() ?? 0) - (a.posting.postedAt?.getTime() ?? 0) ||
      a.posting.id.localeCompare(b.posting.id),
  );
  return dedupeByTitleCompany(ordered)
    .slice(0, DAILY_MAX)
    .map(({ posting, score, explanation }) => ({
      postingId: posting.id,
      title: posting.title,
      company: posting.company,
      location: posting.location,
      source: posting.sourceKey,
      applyUrl: posting.applyUrl,
      postedAt: iso(posting.postedAt),
      score,
      explanation,
    }));
};

/**
 * As vagas do dia (ADR 0037): na primeira visita do dia, escolhe as mais compatíveis do catálogo e
 * guarda; nas visitas seguintes, devolve o que foi guardado. Fica fixo no dia.
 */
export class DailySelectionService {
  constructor(
    private readonly discovery: Pick<DiscoveryService, 'collect'>,
    private readonly repo: DailyPicksRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async today(userId: string): Promise<DailySelection> {
    const day = dayKey(this.now());
    const stored = await this.repo.find(userId, day);
    if (stored) return { state: 'ready', day, ...stored };

    const collected = await this.discovery.collect(userId);
    if (collected.state === 'needs_goal') {
      return { state: 'needs_goal', lastSyncedAt: iso(collected.lastSyncedAt) };
    }
    if (collected.state !== 'ready') return collected;

    const snapshot: DailySnapshot = {
      goal: collected.goal,
      picks: selectPicks(collected.items),
      lastSyncedAt: iso(collected.lastSyncedAt),
    };
    // Dia sem vaga não é guardado: assim uma sincronização mais tarde ainda pode preencher o dia.
    if (snapshot.picks.length > 0) {
      await this.repo.save(userId, day, collected.goal.id, snapshot);
    }
    return { state: 'ready', day, ...snapshot };
  }
}
