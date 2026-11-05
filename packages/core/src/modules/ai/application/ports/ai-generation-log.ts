import type { AiTask, AiUsage } from './ai-provider';

export interface AiGenerationRecord {
  userId: string;
  task: AiTask;
  usage: AiUsage;
  /** Hash do texto enviado, já sem dados pessoais. */
  inputHash: string;
  output: unknown;
  /** Resultado da validação anti-invenção. Só contagens e códigos, sem conteúdo. */
  validation: Record<string, unknown>;
}

/** Registro de toda geração importante: provedor, modelo, versão do prompt e resultado. */
export interface AiGenerationLog {
  record(entry: AiGenerationRecord): Promise<void>;
  /** Retenção: apaga registros antigos. Roda no worker, sem contexto de usuário. */
  deleteOlderThan(cutoff: Date): Promise<number>;
}
