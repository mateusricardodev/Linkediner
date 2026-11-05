import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { AppConfig } from '@linkediner/config';
import { schema, type Database } from '@linkediner/db';
import type { AuditLog } from '../../audit';
import { newId } from '../../shared';

export interface AuthDeps {
  db: Database;
  config: Pick<
    AppConfig,
    | 'NODE_ENV'
    | 'AUTH_SECRET'
    | 'API_PUBLIC_URL'
    | 'WEB_ORIGIN'
    | 'GOOGLE_CLIENT_ID'
    | 'GOOGLE_CLIENT_SECRET'
    | 'GITHUB_CLIENT_ID'
    | 'GITHUB_CLIENT_SECRET'
    | 'LINKEDIN_CLIENT_ID'
    | 'LINKEDIN_CLIENT_SECRET'
  >;
  audit: AuditLog;
  /** HMAC usado para guardar só o hash do IP das sessões. */
  pseudonymize: (value: string) => string;
}

/** Remove tokens de provedores externos: só precisamos da identidade (ADR 0009, minimização). */
export function stripProviderTokens<T extends Record<string, unknown>>(account: T): T {
  return {
    ...account,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
  };
}

/** Provedores OAuth ativos: só os que têm ID e segredo configurados. Escopos mínimos (identidade e e-mail). */
export function socialProvidersFrom(config: AuthDeps['config']) {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};
  if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
    };
  }
  if (config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET) {
    providers.github = {
      clientId: config.GITHUB_CLIENT_ID,
      clientSecret: config.GITHUB_CLIENT_SECRET,
    };
  }
  if (config.LINKEDIN_CLIENT_ID && config.LINKEDIN_CLIENT_SECRET) {
    // "Sign In with LinkedIn using OpenID Connect": apenas login, sem acesso a outras APIs do LinkedIn.
    providers.linkedin = {
      clientId: config.LINKEDIN_CLIENT_ID,
      clientSecret: config.LINKEDIN_CLIENT_SECRET,
    };
  }
  return providers;
}

/**
 * Autenticação com Better Auth (ADR 0009): sessões no nosso Postgres, cookies HttpOnly,
 * senha com Argon2id, OAuth com escopo mínimo e sem guardar tokens de terceiros.
 */
export function createAuth({ db, config, audit, pseudonymize }: AuthDeps) {
  const deployed = config.NODE_ENV === 'staging' || config.NODE_ENV === 'production';

  return betterAuth({
    appName: 'LinkedIner',
    baseURL: config.API_PUBLIC_URL,
    basePath: '/v1/auth',
    secret: config.AUTH_SECRET,
    trustedOrigins: [config.WEB_ORIGIN],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        auth_identities: schema.authIdentities,
        verifications: schema.verifications,
      },
    }),
    user: { modelName: 'users' },
    session: { modelName: 'sessions', expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    account: { modelName: 'auth_identities' },
    verification: { modelName: 'verifications' },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true,
      // Verificação de e-mail entra junto com o módulo de notificações (pendência registrada no PR).
      requireEmailVerification: false,
      password: {
        hash: (password) => argon2Hash(password),
        verify: ({ hash, password }) => argon2Verify(hash, password),
      },
    },
    socialProviders: socialProvidersFrom(config),
    rateLimit: { enabled: true, window: 60, max: 30 },
    advanced: {
      useSecureCookies: deployed,
      cookiePrefix: 'linkediner',
      database: { generateId: () => newId() },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await audit.record({
              actorType: 'user',
              actorId: user.id,
              action: 'user.signed_up',
              entityType: 'user',
              entityId: user.id,
            });
          },
        },
      },
      session: {
        create: {
          before: async (session) => ({
            data: {
              ...session,
              ipAddress: session.ipAddress ? pseudonymize(session.ipAddress) : null,
            },
          }),
          after: async (session) => {
            await audit.record({
              actorType: 'user',
              actorId: session.userId,
              action: 'session.created',
              entityType: 'session',
            });
          },
        },
      },
      account: {
        create: { before: async (account) => ({ data: stripProviderTokens(account) }) },
        update: { before: async (account) => ({ data: stripProviderTokens(account) }) },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export interface Actor {
  userId: string;
  sessionId: string;
}

/** Resolve o usuário autenticado a partir dos cabeçalhos (cookie de sessão). */
export async function resolveActor(auth: Auth, headers: Headers): Promise<Actor | null> {
  const result = await auth.api.getSession({ headers });
  return result ? { userId: result.user.id, sessionId: result.session.id } : null;
}
