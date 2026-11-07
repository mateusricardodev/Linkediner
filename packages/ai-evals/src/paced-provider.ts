import type { AiProvider, GenerateStructuredRequest } from '@linkediner/core/ai';

/** Limite de uso e instabilidade do provedor. Os demais erros são defeitos e ficam no relatório. */
const TRANSIENT = new Set([429, 500, 503]);
const BACKOFF_MS = [30_000, 60_000, 120_000];

const providerStatus = (error: unknown) =>
  (error as { details?: { providerStatus?: unknown } }).details?.providerStatus;

interface PacedOptions {
  minIntervalMs: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Só para a avaliação: espaça as chamadas e repete as falhas temporárias, para o limite do plano não
 * reprovar o modelo. Quantas repetições houve vai para o relatório.
 */
export class PacedProvider implements AiProvider {
  readonly id: string;
  retries = 0;
  private nextCallAt = 0;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    private readonly inner: AiProvider,
    private readonly options: PacedOptions,
  ) {
    this.id = inner.id;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
  }

  private async withPacing<T>(call: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const wait = this.nextCallAt - this.now();
      if (wait > 0) await this.sleep(wait);
      this.nextCallAt = this.now() + this.options.minIntervalMs;
      try {
        return await call();
      } catch (error) {
        const backoff = BACKOFF_MS[attempt];
        if (backoff === undefined || !TRANSIENT.has(providerStatus(error) as number)) throw error;
        this.retries++;
        await this.sleep(backoff);
      }
    }
  }

  generateStructured<T>(req: GenerateStructuredRequest<T>) {
    return this.withPacing(() => this.inner.generateStructured(req));
  }

  embed(texts: string[], opts?: { model?: string }) {
    return this.withPacing(() => this.inner.embed(texts, opts));
  }
}
