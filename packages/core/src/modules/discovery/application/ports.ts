import type { JobFields } from '../../jobs';
import type { CareerGoal } from '../../profile';
import type { ExternalPosting } from '../domain/discovery';

/** Cada fonte é um adaptador. Desligar ou trocar uma não afeta o restante (ADR 0006). */
export interface JobSourceAdapter {
  readonly key: string;
  listPostings(token: string): Promise<ExternalPosting[]>;
}

export interface Board {
  id: string;
  sourceKey: string;
  token: string;
  company: string;
}

export interface CatalogPosting {
  id: string;
  title: string;
  company: string;
  location: string;
  remoteHint: boolean;
  applyUrl: string;
  postedAt: Date | null;
  rawText: string;
  sourceKey: string;
  structured: boolean;
  fields: Pick<
    JobFields,
    'employmentType' | 'salaryText' | 'remotePolicy' | 'seniority' | 'mustHave' | 'niceToHave'
  >;
}

/** Manutenção do catálogo pelo worker: dados públicos, sem contexto de usuário. */
export interface CatalogRepository {
  /** Só empresas de fontes ligadas. Fonte desligada não recebe nenhuma chamada. */
  activeBoards(): Promise<Board[]>;
  /** Grava o que veio da fonte e remove o que sumiu. Texto novo volta para análise. */
  replacePostings(
    board: Board,
    postings: ExternalPosting[],
    now: Date,
  ): Promise<{ inserted: number; updated: number; removed: number }>;
  markBoard(boardId: string, result: { syncedAt: Date } | { error: string }): Promise<void>;
  /** Mais recentes primeiro: quem acabou de sair é analisado antes. */
  pendingPostings(limit: number): Promise<CatalogPosting[]>;
  /** Objetivos ativos de todas as pessoas. Só decidem o que analisar: nunca saem daqui. */
  activeGoals(): Promise<Pick<CareerGoal, 'title' | 'targetRoles' | 'locations' | 'remoteOnly'>[]>;
  saveStructured(
    id: string,
    fields: CatalogPosting['fields'],
    usage: { model: string; promptVersion: number },
  ): Promise<void>;
  markStructureFailed(id: string): Promise<void>;
}

/** Leitura pela pessoa, com o papel da aplicação. */
export interface CatalogReader {
  isEnabled(userId: string): Promise<boolean>;
  open(userId: string): Promise<CatalogPosting[]>;
  find(userId: string, id: string): Promise<CatalogPosting | null>;
  lastSyncedAt(userId: string): Promise<Date | null>;
}
