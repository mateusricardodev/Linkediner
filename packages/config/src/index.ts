import { z } from 'zod';

/**
 * Leitura e validação das variáveis de ambiente.
 * A aplicação falha na inicialização se alguma variável obrigatória estiver ausente ou inválida.
 * Nenhum segredo tem valor padrão.
 */
const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DATABASE_URL: z.url(),

    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.url().default('http://localhost:3000'),

    STORAGE_ENDPOINT: z.url().optional(),
    STORAGE_REGION: z.string().default('auto'),
    STORAGE_BUCKET: z.string().default('linkediner-documents'),
    STORAGE_ACCESS_KEY_ID: z.string().optional(),
    STORAGE_SECRET_ACCESS_KEY: z.string().optional(),

    AI_PROVIDER: z.enum(['fake', 'gemini']).default('fake'),
    AI_TIER: z.enum(['free', 'paid']).default('free'),
    GEMINI_API_KEY: z.string().optional(),

    /** Usado para pseudonimizar IDs em logs (HMAC). Obrigatório fora de dev/test. */
    LOG_PSEUDONYM_SECRET: z.string().min(32).optional(),

    WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
    OTEL_ENABLED: booleanString,
  })
  .superRefine((env, ctx) => {
    const deployed = env.NODE_ENV === 'staging' || env.NODE_ENV === 'production';

    if (env.AI_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['GEMINI_API_KEY'],
        message: 'Obrigatória quando AI_PROVIDER=gemini.',
      });
    }
    // ADR 0004: o plano gratuito do Gemini só pode ser usado em protótipo, com dados sintéticos.
    if (env.NODE_ENV === 'production' && env.AI_PROVIDER === 'gemini' && env.AI_TIER !== 'paid') {
      ctx.addIssue({
        code: 'custom',
        path: ['AI_TIER'],
        message:
          'Em produção, o provedor de IA deve estar no plano pago (AI_TIER=paid). Ver ADR 0004.',
      });
    }
    if (env.NODE_ENV === 'production' && env.AI_PROVIDER === 'fake') {
      ctx.addIssue({
        code: 'custom',
        path: ['AI_PROVIDER'],
        message: 'O provedor fake não pode ser usado em produção.',
      });
    }
    if (deployed && !env.LOG_PSEUDONYM_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['LOG_PSEUDONYM_SECRET'],
        message: 'Obrigatória em staging e produção.',
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Configuração inválida:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // Mostra apenas o nome da variável e a regra, nunca o valor (pode ser um segredo).
    throw new ConfigError(
      result.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`),
    );
  }
  return result.data;
}
