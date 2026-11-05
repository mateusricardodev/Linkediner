import { createRequire } from 'node:module';
import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';
import { redact } from './redaction';

export type { Logger } from 'pino';

export interface CreateLoggerOptions {
  service: string;
  level?: LoggerOptions['level'];
  pretty?: boolean;
  /** Permite capturar a saída em testes. */
  destination?: DestinationStream;
}

/**
 * Logger JSON com redação automática de dados pessoais.
 * Toda propriedade com nome sensível é substituída por [REDACTED] antes de ser escrita.
 */
export function createLogger({
  service,
  level = 'info',
  pretty = false,
  destination,
}: CreateLoggerOptions): Logger {
  const options: LoggerOptions = {
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
      log: (obj) => redact(obj) as Record<string, unknown>,
    },
    serializers: {
      err: (err: unknown) => redact(err),
      error: (err: unknown) => redact(err),
    },
  };
  if (pretty && !destination && prettyAvailable()) {
    return pino({ ...options, transport: { target: 'pino-pretty', options: { colorize: true } } });
  }
  return destination ? pino(options, destination) : pino(options);
}

/** pino-pretty é dependência só de desenvolvimento. Sem ele (ex.: build empacotado), o log sai em JSON. */
function prettyAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}
