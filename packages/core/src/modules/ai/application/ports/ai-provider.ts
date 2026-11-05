import type { ZodType } from 'zod';

/** Tarefas de IA do produto (docs/arquitetura/05-ia-e-documentos.md). */
export type AiTask =
  | 'extract_profile'
  | 'score_profile_signals'
  | 'structure_job'
  | 'match_explain'
  | 'generate_resume'
  | 'generate_cover_letter'
  | 'answer_form'
  | 'classify_job';

/** Prompt versionado. Depois de publicado, um prompt não muda: alterações viram nova versão. */
export interface VersionedPrompt {
  id: string;
  version: number;
  system: string;
  render(input: Record<string, unknown>): string;
}

export interface AiFile {
  mimeType: 'application/pdf' | 'text/plain';
  data: Uint8Array;
}

export interface GenerateStructuredRequest<T> {
  task: AiTask;
  prompt: VersionedPrompt;
  promptInput: Record<string, unknown>;
  schema: ZodType<T>;
  files?: AiFile[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AiUsage {
  provider: string;
  model: string;
  promptId: string;
  promptVersion: number;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export interface AiResult<T> {
  data: T;
  usage: AiUsage;
}

/**
 * Porta de IA. O domínio depende só desta interface (ADR 0004).
 * Implementações: FakeAiProvider (testes e ambiente local) e, depois, GeminiProvider.
 */
export interface AiProvider {
  readonly id: string;
  generateStructured<T>(req: GenerateStructuredRequest<T>): Promise<AiResult<T>>;
  embed(
    texts: string[],
    opts?: { model?: string },
  ): Promise<{ vectors: number[][]; model: string; dims: number }>;
}
