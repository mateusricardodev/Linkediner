import type { ZodType } from 'zod';
import type { Logger } from '@linkediner/observability';

export interface TaskContext {
  logger: Logger;
  jobId: string;
  attempt: number;
}

/**
 * Definição de uma tarefa assíncrona (docs/arquitetura/08-operacao.md).
 * Regras: o handler é idempotente e o payload leva apenas IDs, nunca dados pessoais.
 */
export interface TaskDefinition<P> {
  name: string;
  payload: ZodType<P>;
  retryLimit: number;
  expireInSeconds: number;
  /** Agendamento cron opcional (ex.: tarefas diárias de expiração). */
  cron?: string;
  handle(payload: P, ctx: TaskContext): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTask = TaskDefinition<any>;

export const defineTask = <P>(task: TaskDefinition<P>): TaskDefinition<P> => task;

export const deadLetterQueue = (name: string) => `${name}.dead`;
