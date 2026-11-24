export interface WaitOptions {
  /** Tempo total de espera antes de desistir. */
  timeoutMs: number;
  /** Intervalo entre as tentativas. */
  intervalMs: number;
  onRetry?: (error: unknown, attempt: number) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Repete `task` até dar certo ou o prazo acabar. Serve para serviços locais que sobem junto com
 * a API (como o S3 do Docker) e ainda não estão prontos no primeiro acesso.
 */
export async function waitUntilReady<T>(task: () => Promise<T>, opts: WaitOptions): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const deadline = now() + opts.timeoutMs;
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (now() + opts.intervalMs > deadline) throw error;
      opts.onRetry?.(error, attempt);
      await sleep(opts.intervalMs);
    }
  }
}
