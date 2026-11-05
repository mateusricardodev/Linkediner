import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleAuditLog } from '@linkediner/core/audit';
import { createAuth, DrizzleUserReader } from '@linkediner/core/identity';
import { ConsentService, DrizzleConsentRepository } from '@linkediner/core/privacy';
import { DrizzleProfileRepository, ProfileService } from '@linkediner/core/profile';
import { startTestDatabase } from '@linkediner/db/testing';
import { createLogger, createPseudonymizer } from '@linkediner/observability';
import { actorOf, requireActor } from './plugins/auth';
import { requireConsents } from './plugins/require-consents';
import { buildServer } from './server';

const WEB = 'http://localhost:3000';
// Senha fictícia, usada apenas nestes testes.
const TEST_PASSWORD = 'senha-forte-123'; // gitleaks:allow
const WRONG_PASSWORD = 'senha-errada-000'; // gitleaks:allow
const silent = createLogger({
  service: 'test',
  level: 'silent',
  destination: new Writable({ write: (_c, _e, cb) => cb() }),
});

let ctx: Awaited<ReturnType<typeof startTestDatabase>>;
let app: Awaited<ReturnType<typeof buildServer>>;

const cookieFrom = (res: { cookies: { name: string; value: string }[] }) =>
  res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

async function signUp(email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/sign-up/email',
    headers: { origin: WEB, 'content-type': 'application/json' },
    payload: { email, password: TEST_PASSWORD, name: 'Pessoa Teste' },
  });
  expect(res.statusCode).toBe(200);
  return cookieFrom(res);
}

const consent = (cookie: string, purpose: string, granted = true, origin: string | null = WEB) =>
  app.inject({
    method: 'PUT',
    url: `/v1/me/consents/${purpose}`,
    headers: { cookie, 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    payload: { granted },
  });

beforeAll(async () => {
  ctx = await startTestDatabase();
  const db = ctx.handle.db;
  const pseudonymize = createPseudonymizer('p'.repeat(32));
  const audit = new DrizzleAuditLog(db, pseudonymize);
  const consents = new ConsentService(new DrizzleConsentRepository(db), audit);
  app = await buildServer({
    config: { NODE_ENV: 'test', WEB_ORIGIN: WEB },
    logger: silent,
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
    },
  });
  // Rota de exemplo do produto, protegida por login + consentimentos obrigatórios.
  app.get(
    '/v1/exemplo',
    { preHandler: [requireActor, requireConsents(consents)] },
    async (req) => ({ userId: actorOf(req).userId }),
  );
}, 120_000);

afterAll(async () => {
  await app?.close();
  await ctx?.stop();
});

describe('conta e consentimentos', () => {
  let alice = '';

  it('cadastro por e-mail cria sessão em cookie HttpOnly', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up/email',
      headers: { origin: WEB, 'content-type': 'application/json' },
      payload: { email: 'alice@example.com', password: TEST_PASSWORD, name: 'Alice' },
    });
    expect(res.statusCode).toBe(200);
    const session = res.cookies.find((c) => c.name.includes('session_token'));
    expect(session?.httpOnly).toBe(true);
    expect(res.body).not.toContain(session!.value);
    alice = cookieFrom(res);
  });

  it('GET /v1/me sem sessão devolve 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('novo usuário precisa aceitar termos e privacidade', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: { cookie: alice } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      user: { email: 'alice@example.com', name: 'Alice', locale: 'pt-BR' },
      consents: { missingRequired: ['terms', 'privacy'], granted: { model_training: false } },
    });
  });

  it('rotas do produto ficam bloqueadas até o aceite', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/exemplo', headers: { cookie: alice } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      code: 'CONSENT_REQUIRED',
      details: { missing: ['terms', 'privacy'] },
    });
  });

  it('mutação sem Origin do frontend é recusada (CSRF)', async () => {
    expect((await consent(alice, 'terms', true, null)).statusCode).toBe(403);
    expect((await consent(alice, 'terms', true, 'https://site-malicioso.example')).statusCode).toBe(
      403,
    );
  });

  it('aceitar termos e privacidade libera o produto', async () => {
    expect((await consent(alice, 'terms')).statusCode).toBe(200);
    const res = await consent(alice, 'privacy');
    expect(res.json()).toMatchObject({ missingRequired: [] });
    const product = await app.inject({
      method: 'GET',
      url: '/v1/exemplo',
      headers: { cookie: alice },
    });
    expect(product.statusCode).toBe(200);
  });

  it('revogar um consentimento opcional fica registrado', async () => {
    await consent(alice, 'marketing', true);
    const res = await consent(alice, 'marketing', false);
    expect(res.json().granted.marketing).toBe(false);
  });

  it('consentimentos de um usuário não aparecem para outro', async () => {
    const bob = await signUp('bob@example.com');
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: { cookie: bob } });
    expect(res.json()).toMatchObject({
      user: { email: 'bob@example.com' },
      consents: { missingRequired: ['terms', 'privacy'] },
    });
  });

  it('senha errada não autentica', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in/email',
      headers: { origin: WEB, 'content-type': 'application/json' },
      payload: { email: 'alice@example.com', password: WRONG_PASSWORD },
    });
    expect(res.statusCode).toBe(401);
    expect(res.cookies.find((c) => c.name.includes('session_token'))).toBeUndefined();
  });
});

describe('armazenamento seguro', () => {
  it('senha guardada só como hash Argon2id', async () => {
    const { rows } = await ctx.handle.pool.query(
      "SELECT password FROM auth_identities WHERE provider_id = 'credential'",
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.password).toMatch(/^\$argon2id\$/);
  });

  it('IP da sessão guardado só como hash', async () => {
    const { rows } = await ctx.handle.pool.query('SELECT ip_address FROM sessions');
    for (const r of rows)
      expect(r.ip_address === null || !/^[\d.:]+$/.test(r.ip_address)).toBe(true);
  });

  it('auditoria registra cadastro, sessão e consentimento com ator pseudonimizado', async () => {
    const { rows: users } = await ctx.handle.pool.query('SELECT id FROM users');
    const { rows } = await ctx.handle.pool.query('SELECT action, actor_id FROM audit_logs');
    const actions = new Set(rows.map((r) => r.action));
    for (const a of ['user.signed_up', 'session.created', 'consent.granted', 'consent.revoked'])
      expect(actions).toContain(a);
    const ids = new Set(users.map((u) => u.id));
    for (const r of rows) expect(ids.has(r.actor_id)).toBe(false);
  });

  it('IDs de usuário são UUID v7', async () => {
    const { rows } = await ctx.handle.pool.query('SELECT id::text FROM users');
    for (const r of rows) expect(r.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });
});
