/**
 * Erros de domínio com código estável. A API converte cada código em um Problem Details (RFC 9457).
 * A mensagem é segura para mostrar ao usuário: nunca inclua dados pessoais nela.
 */
export const ERROR_CODES = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  CONSENT_REQUIRED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE_TRANSITION: 409,
  QUOTA_EXCEEDED: 429,
  RATE_LIMITED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
    this.status = ERROR_CODES[code];
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
