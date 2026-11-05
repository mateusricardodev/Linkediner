import { Writable } from 'node:stream';
import { DrizzleAuditLog } from '@linkediner/core/audit';
import { createAuth, DrizzleUserReader } from '@linkediner/core/identity';
import { ConsentService, DrizzleConsentRepository } from '@linkediner/core/privacy';
import { DrizzleProfileRepository, ProfileService } from '@linkediner/core/profile';
import { DocumentService, DrizzleDocumentRepository } from '@linkediner/core/documents';
import { startTestS3 } from '@linkediner/core/testing';
import { startTestDatabase } from '@linkediner/db/testing';
import { createLogger, createPseudonymizer } from '@linkediner/observability';
import { buildServer } from '../server';

export const WEB = 'http://localhost:3000';
// Senha fictícia, usada apenas em testes.
export const TEST_PASSWORD = 'senha-forte-123'; // gitleaks:allow

/** Sobe Postgres e S3 em containers e a API completa, como em produção, para testes de integração. */
export async function startTestApp() {
  const [ctx, s3] = await Promise.all([startTestDatabase(), startTestS3()]);
  const db = ctx.handle.db;
  const pseudonymize = createPseudonymizer('p'.repeat(32));
  const audit = new DrizzleAuditLog(db, pseudonymize);
  const consents = new ConsentService(new DrizzleConsentRepository(db), audit);
  const app = await buildServer({
    config: { NODE_ENV: 'test', WEB_ORIGIN: WEB },
    logger: createLogger({
      service: 'test',
      level: 'silent',
      destination: new Writable({ write: (_c, _e, cb) => cb() }),
    }),
    health: { checks: {} },
    account: {
      auth: createAuth({
        db,
        audit,
        pseudonymize,
        config: {
          NODE_ENV: 'test',
          AUTH_SECRET: 's'.repeat(32),
          API_PUBLIC_URL: 'http://localhost:4000',
          WEB_ORIGIN: WEB,
        },
      }),
      users: new DrizzleUserReader(db),
      consents,
      profile: new ProfileService(new DrizzleProfileRepository(db)),
      documents: new DocumentService(new DrizzleDocumentRepository(db), s3.storage, audit),
    },
  });

  /** Cria um usuário e devolve o cabeçalho de cookie da sessão. */
  async function signUp(email: string, { acceptConsents = true } = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up/email',
      headers: { origin: WEB, 'content-type': 'application/json' },
      payload: { email, password: TEST_PASSWORD, name: 'Pessoa Teste' },
    });
    if (res.statusCode !== 200) throw new Error(`cadastro falhou: ${res.statusCode}`);
    const cookie = res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    if (acceptConsents) {
      for (const purpose of ['terms', 'privacy']) {
        await app.inject({
          method: 'PUT',
          url: `/v1/me/consents/${purpose}`,
          headers: { cookie, origin: WEB, 'content-type': 'application/json' },
          payload: { granted: true },
        });
      }
    }
    return cookie;
  }

  /** Requisição autenticada com Origin do frontend. */
  const call = (
    cookie: string,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: unknown,
  ) =>
    app.inject({
      method,
      url,
      headers: {
        cookie,
        origin: WEB,
        ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
    });

  return {
    app,
    db: ctx.handle,
    storage: s3.storage,
    audit,
    consents,
    signUp,
    call,
    stop: async () => {
      await app.close();
      await Promise.all([ctx.stop(), s3.stop()]);
    },
  };
}
