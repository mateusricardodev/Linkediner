/**
 * Chaves que nunca podem aparecer em logs com valor real (docs/arquitetura/08-operacao.md).
 * A comparação ignora maiúsculas/minúsculas e vale em qualquer nível de aninhamento.
 */
export const SENSITIVE_KEYS = [
  'email',
  'name',
  'fullName',
  'firstName',
  'lastName',
  'phone',
  'address',
  'cpf',
  'birthDate',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'authorization',
  'cookie',
  'set-cookie',
  'text',
  'content',
  'resume',
  'coverLetter',
  'prompt',
  'output',
  'extractedText',
  'description',
] as const;

export const REDACTED = '[REDACTED]';
const sensitive = new Set(SENSITIVE_KEYS.map((k) => k.toLowerCase()));

export function isSensitiveKey(key: string): boolean {
  return sensitive.has(key.toLowerCase());
}

/** Copia o valor substituindo campos sensíveis por [REDACTED], em qualquer profundidade. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (value instanceof Error) {
    return { type: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = isSensitiveKey(k) ? REDACTED : redact(v, depth + 1);
  }
  return out;
}
