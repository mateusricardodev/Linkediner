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
    /** URL pública da API, usada nos callbacks de OAuth. */
    API_PUBLIC_URL: z.url().default('http://localhost:4000'),

    /** Segredo para assinar sessões e cookies (mínimo 32 caracteres). Sem valor padrão. */
    AUTH_SECRET: z.string().min(32),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    LINKEDIN_CLIENT_ID: z.string().optional(),
    LINKEDIN_CLIENT_SECRET: z.string().optional(),

    /**
     * Protege as chaves de cada usuário (ADR 0020): 32 bytes em base64. Sem valor padrão.
     * Perder este valor torna ilegíveis os dados cifrados de todos os usuários.
     */
    DATA_MASTER_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'Deve ter 32 bytes em base64.'),
    /** Só para as chaves: fora dos backups do banco, sem versionamento e sem regra de expiração. */
    STORAGE_KEYS_BUCKET: z.string().default('linkediner-keys'),

    /** Pagamentos: os quatro valores juntos. Sem eles, o produto funciona só no plano gratuito. */
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_PRO: z.string().optional(),
    STRIPE_PRICE_ADVANCED: z.string().optional(),

    STORAGE_ENDPOINT: z.url().optional(),
    STORAGE_REGION: z.string().default('auto'),
    STORAGE_BUCKET: z.string().default('linkediner-documents'),
    STORAGE_ACCESS_KEY_ID: z.string().optional(),
    STORAGE_SECRET_ACCESS_KEY: z.string().optional(),

    AI_PROVIDER: z.enum(['fake', 'gemini']).default('fake'),
    AI_TIER: z.enum(['free', 'paid']).default('free'),
    GEMINI_API_KEY: z.string().optional(),
    /** Modelo usado na extração. Obrigatório com Gemini: nomes de modelo mudam, então não há valor padrão. */
    AI_MODEL_EXTRACT: z.string().min(1).optional(),

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
    if (env.AI_PROVIDER === 'gemini' && !env.AI_MODEL_EXTRACT) {
      ctx.addIssue({
        code: 'custom',
        path: ['AI_MODEL_EXTRACT'],
        message: 'Obrigatório quando AI_PROVIDER=gemini.',
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
    for (const provider of ['GOOGLE', 'GITHUB', 'LINKEDIN'] as const) {
      const id = env[`${provider}_CLIENT_ID`];
      const secret = env[`${provider}_CLIENT_SECRET`];
      if (Boolean(id) !== Boolean(secret)) {
        ctx.addIssue({
          code: 'custom',
          path: [`${provider}_CLIENT_SECRET`],
          message: `${provider}_CLIENT_ID e ${provider}_CLIENT_SECRET devem ser definidos juntos.`,
        });
      }
    }
    if (deployed && !env.API_PUBLIC_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_PUBLIC_URL'],
        message: 'Deve usar HTTPS em staging e produção.',
      });
    }
    const stripe = [
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_PRICE_PRO',
      'STRIPE_PRICE_ADVANCED',
    ] as const;
    if (stripe.some((k) => env[k]) && !stripe.every((k) => env[k])) {
      ctx.addIssue({
        code: 'custom',
        path: ['STRIPE_SECRET_KEY'],
        message: `Defina juntos: ${stripe.join(', ')}.`,
      });
    }
    if (env.NODE_ENV === 'production' && env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
      ctx.addIssue({
        code: 'custom',
        path: ['STRIPE_SECRET_KEY'],
        message: 'Em produção, use a chave real da Stripe, não a de teste.',
      });
    }
    if (env.STORAGE_KEYS_BUCKET === env.STORAGE_BUCKET) {
      // O bucket de documentos expira objetos em 30 dias: as chaves sumiriam junto, com os dados.
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_KEYS_BUCKET'],
        message: 'As chaves precisam de um bucket separado do bucket de documentos.',
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
