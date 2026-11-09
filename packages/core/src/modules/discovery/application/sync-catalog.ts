import type { AiProvider, VersionedPrompt } from '../../ai';
import { redactSensitiveData } from '../../extraction';
import { groundJob, JobOutput } from '../../jobs';
import { isRelevantPosting, matchesGoal } from '../domain/discovery';
import type { CatalogRepository, JobSourceAdapter } from './ports';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface SyncDeps {
  catalog: Pick<CatalogRepository, 'activeBoards' | 'replacePostings' | 'markBoard'>;
  adapters: JobSourceAdapter[];
  now?: () => Date;
  wait?: (ms: number) => Promise<void>;
  /** Intervalo entre empresas, para não pesar nas fontes. */
  intervalMs?: number;
}

const errorCode = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  return message.startsWith('source_') ? message : 'source_invalid_response';
};

/** Atualiza o catálogo a partir das fontes ligadas. Uma empresa com problema não para as outras. */
export class SyncCatalog {
  constructor(private readonly deps: SyncDeps) {}

  async run() {
    const { catalog, adapters, now = () => new Date(), wait = sleep, intervalMs = 500 } = this.deps;
    const totals = { boards: 0, failed: 0, inserted: 0, updated: 0, removed: 0 };
    const boards = await catalog.activeBoards();
    for (const board of boards) {
      const adapter = adapters.find((item) => item.key === board.sourceKey);
      if (!adapter) continue;
      totals.boards++;
      try {
        const postings = (await adapter.listPostings(board.token)).filter(isRelevantPosting);
        const result = await catalog.replacePostings(board, postings, now());
        totals.inserted += result.inserted;
        totals.updated += result.updated;
        totals.removed += result.removed;
        await catalog.markBoard(board.id, { syncedAt: now() });
      } catch (error) {
        // Em caso de falha, o que já está no catálogo fica como está.
        totals.failed++;
        await catalog.markBoard(board.id, { error: errorCode(error) });
      }
      await wait(intervalMs);
    }
    return totals;
  }
}

export interface StructureDeps {
  catalog: Pick<
    CatalogRepository,
    'pendingPostings' | 'activeGoals' | 'saveStructured' | 'markStructureFailed'
  >;
  ai: AiProvider;
  prompt: VersionedPrompt;
  wait?: (ms: number) => Promise<void>;
  /** Teto por rodada, para limitar o custo. O que sobra fica para a próxima. */
  limit: number;
  /** Intervalo entre chamadas, para respeitar o limite por minuto do provedor. */
  intervalMs: number;
}

/** Vale tentar de novo depois: limite de uso ou instabilidade do provedor. */
const TEMPORARY = new Set([429, 500, 503]);

/**
 * Analisa o texto público das vagas que interessam a algum objetivo ativo. Cada vaga é analisada
 * uma vez, para todo mundo. A IA recebe só o texto da vaga: nada de perfil nem de objetivo.
 */
export class StructureCatalog {
  constructor(private readonly deps: StructureDeps) {}

  async run() {
    const { catalog, ai, prompt, limit, intervalMs, wait = sleep } = this.deps;
    const totals = { structured: 0, failed: 0, stoppedEarly: false };
    const goals = await catalog.activeGoals();
    if (goals.length === 0) return totals;

    const pending = await catalog.pendingPostings(1000);
    const wanted = pending
      .filter((posting) =>
        goals.some((goal) => matchesGoal({ ...posting, remotePolicy: null }, goal)),
      )
      .slice(0, limit);

    for (const posting of wanted) {
      // A vaga pode trazer e-mail ou telefone de recrutadores: não precisam ir para o provedor.
      const jobText = redactSensitiveData(posting.rawText);
      try {
        const { data, usage } = await ai.generateStructured({
          task: 'structure_job',
          prompt,
          promptInput: { jobText },
          schema: JobOutput,
        });
        const { fields } = groundJob(data, jobText);
        await catalog.saveStructured(
          posting.id,
          {
            employmentType: fields.employmentType,
            salaryText: fields.salaryText,
            remotePolicy: fields.remotePolicy,
            seniority: fields.seniority,
            mustHave: fields.mustHave,
            niceToHave: fields.niceToHave,
          },
          { model: usage.model, promptVersion: usage.promptVersion },
        );
        totals.structured++;
      } catch (error) {
        const status = (error as { details?: { providerStatus?: unknown } }).details
          ?.providerStatus;
        if (TEMPORARY.has(status as number)) {
          // Insistir só gastaria o limite: o restante fica para a próxima rodada.
          totals.stoppedEarly = true;
          break;
        }
        await catalog.markStructureFailed(posting.id);
        totals.failed++;
      }
      await wait(intervalMs);
    }
    return totals;
  }
}
