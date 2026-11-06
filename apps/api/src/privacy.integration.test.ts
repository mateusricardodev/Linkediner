import JSZip from 'jszip';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DrizzleAccountDataReader,
  DrizzleAccountDeletionRepository,
  DrizzleDataExportRepository,
  EXPORTED_TABLES,
  ExportUserData,
  NOT_EXPORTED_TABLES,
  PARTIALLY_EXPORTED_TABLES,
  PurgeUser,
} from '@linkediner/core/privacy/account';
import { buildExportZip } from '@linkediner/core/privacy/account-worker';
import { createFieldCipher, keyObjectName } from '@linkediner/core/crypto';
import { DrizzleFactRepository } from '@linkediner/core/profile';
import { DrizzleResumeRepository } from '@linkediner/core/resumes';
import { startTestApp, TEST_PASSWORD, WEB } from './testing/app';

// Dados fictícios.
let t: Awaited<ReturnType<typeof startTestApp>>;
let purge: PurgeUser;
let exporter: ExportUserData;
const cancelled: string[] = [];

/** Tabelas que têm usuário, segundo o próprio banco: pega qualquer tabela nova. */
async function userTables(): Promise<string[]> {
  const { rows } = await t.db.pool.query(
    `SELECT table_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'user_id' ORDER BY 1`,
  );
  return rows.map((r) => r.table_name as string).sort();
}

beforeAll(async () => {
  t = await startTestApp();
  purge = new PurgeUser({
    repo: new DrizzleAccountDeletionRepository(t.db.db),
    storage: t.storage,
    keys: t.cipher,
    subscriptions: t.subscriptions,
    tasks: {
      cancelForUser: async (userId) => {
        cancelled.push(userId);
        return 0;
      },
    },
  });
  exporter = new ExportUserData({
    repo: new DrizzleDataExportRepository(t.db.db),
    reader: new DrizzleAccountDataReader(t.db.db, t.cipher),
    storage: t.storage,
    zip: buildExportZip,
    audit: t.audit,
  });
}, 180_000);

afterAll(async () => t?.stop());
beforeEach(() => {
  t.purgeQueue.jobs.length = 0;
  t.exportQueue.jobs.length = 0;
});

/** Conta com dados em várias tabelas e um arquivo no storage. */
async function setup(email: string) {
  const cookie = await t.signUp(email);
  const userId = (await t.call(cookie, 'GET', '/v1/me')).json().user.id as string;
  await new DrizzleFactRepository(t.db.db, t.cipher).addConfirmed(userId, {
    type: 'skill',
    data: { name: 'React' },
  });
  const key = `users/${userId}/documents/${crypto.randomUUID()}`;
  await t.storage.putBytes(key, new Uint8Array([1, 2, 3]), 'application/pdf');
  return { cookie, userId, key };
}

// A rota aceita 5 pedidos por minuto de cada IP: cada pedido usa um IP próprio nos testes.
let requests = 0;
const deleteAccount = (cookie: string, confirmEmail: string) =>
  t.app.inject({
    method: 'POST',
    url: '/v1/privacy/delete-account',
    headers: { cookie, origin: WEB, 'content-type': 'application/json' },
    payload: { confirmEmail },
    remoteAddress: `10.0.2.${++requests}`,
  });
const signIn = (email: string) =>
  t.app.inject({
    method: 'POST',
    url: '/v1/auth/sign-in/email',
    headers: { origin: WEB, 'content-type': 'application/json' },
    payload: { email, password: TEST_PASSWORD },
  });
const makeSessionOld = (userId: string) =>
  t.db.pool.query(
    `UPDATE sessions SET created_at = now() - interval '2 hours' WHERE user_id = $1`,
    [userId],
  );

describe('exclusão da conta', () => {
  it('exige o e-mail certo e login recente, e não apaga nada sem isso', async () => {
    const email = 'del-confirma@example.com';
    const { cookie, userId } = await setup(email);
    expect((await deleteAccount(cookie, 'outra@example.com')).statusCode).toBe(400);
    await makeSessionOld(userId);
    const old = await deleteAccount(cookie, email);
    expect(old.statusCode).toBe(403);
    expect(old.json()).toMatchObject({ details: { reason: 'recent_login_required' } });
    expect(t.purgeQueue.jobs).toEqual([]);
    expect((await t.call(cookie, 'GET', '/v1/me')).statusCode).toBe(200);
  });

  it('encerra a sessão na hora e bloqueia novo login até o expurgo terminar', async () => {
    const email = 'del-sessao@example.com';
    const { cookie, userId } = await setup(email);
    expect((await deleteAccount(cookie, email)).statusCode).toBe(202);
    expect((await t.call(cookie, 'GET', '/v1/me')).statusCode).toBe(401);
    expect((await signIn(email)).statusCode).toBeGreaterThanOrEqual(400);
    const { rows } = await t.db.pool.query(
      'SELECT count(*)::int AS n FROM sessions WHERE user_id = $1',
      [userId],
    );
    expect(rows[0].n).toBe(0);
    expect(Object.keys(t.purgeQueue.jobs[0]!)).toEqual(['requestId']);
  });

  it('apaga em todas as tabelas e no storage, sem tocar em outra conta', async () => {
    const email = 'del-tudo@example.com';
    const { cookie, userId, key } = await setup(email);
    const other = await setup('del-outra@example.com');

    await deleteAccount(cookie, email);
    const job = t.purgeQueue.jobs[0]!;
    expect(await purge.run(job, { isLastAttempt: false })).toBe('completed');
    expect(cancelled).toContain(userId);

    for (const table of await userTables()) {
      const { rows } = await t.db.pool.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`,
        [userId],
      );
      expect({ table, rows: rows[0].n }).toEqual({ table, rows: 0 });
    }
    const { rows: users } = await t.db.pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    expect(users).toEqual([]);
    expect(await t.storage.head(key)).toBeNull();

    expect(await t.storage.head(other.key)).not.toBeNull();
    expect((await t.call(other.cookie, 'GET', '/v1/me')).statusCode).toBe(200);
    const { rows: facts } = await t.db.pool.query(
      'SELECT count(*)::int AS n FROM profile_facts WHERE user_id = $1',
      [other.userId],
    );
    expect(facts[0].n).toBe(1);
  });

  it('a auditoria e o pedido guardam só o pseudônimo, e o relatório só contagens', async () => {
    const email = 'del-audit@example.com';
    const { cookie, userId } = await setup(email);
    await deleteAccount(cookie, email);
    const job = t.purgeQueue.jobs[0]!;
    await purge.run(job, { isLastAttempt: false });

    const { rows: audit } = await t.db.pool.query('SELECT * FROM audit_logs');
    const dump = JSON.stringify(audit);
    expect(dump).not.toContain(userId);
    expect(dump).not.toContain(email);
    expect(audit.map((r) => r.action)).toContain('account.purged');

    const { rows } = await t.db.pool.query('SELECT * FROM deletion_requests WHERE id = $1', [
      job.requestId,
    ]);
    expect(rows[0]).toMatchObject({ status: 'completed', user_id: null });
    expect(rows[0].completed_at).not.toBeNull();
    expect(JSON.stringify(rows[0])).not.toContain(userId);
    expect(Object.keys(rows[0].report).sort()).toEqual([
      'cancelledSubscriptions',
      'cancelledTasks',
      'deletedFiles',
    ]);
  });

  it('repetir o expurgo não faz nada, e o e-mail fica livre para uma nova conta', async () => {
    const email = 'del-repete@example.com';
    const { cookie } = await setup(email);
    await deleteAccount(cookie, email);
    const job = t.purgeQueue.jobs[0]!;
    await purge.run(job, { isLastAttempt: false });
    expect(await purge.run(job, { isLastAttempt: false })).toBe('skipped');
    expect((await t.call(await t.signUp(email), 'GET', '/v1/me')).statusCode).toBe(200);
  });

  it('funciona mesmo sem os consentimentos obrigatórios aceitos', async () => {
    const email = 'del-sem-termos@example.com';
    const cookie = await t.signUp(email, { acceptConsents: false });
    expect((await deleteAccount(cookie, email)).statusCode).toBe(202);
  });
});

describe('criptografia por usuário', () => {
  const rawFact = async (userId: string) =>
    (await t.db.pool.query('SELECT data FROM profile_facts WHERE user_id = $1', [userId])).rows[0]
      .data;

  it('o banco guarda o conteúdo cifrado, e a API devolve o conteúdo legível', async () => {
    const { cookie, userId } = await setup('cif-banco@example.com');
    expect(JSON.stringify(await rawFact(userId))).not.toContain('React');
    const facts = (await t.call(cookie, 'GET', '/v1/profile/facts')).json();
    expect(facts[0].data).toEqual({ name: 'React' });

    const resumes = new DrizzleResumeRepository(t.db.db, t.cipher);
    const resumeId = crypto.randomUUID();
    await resumes.insertGenerating(userId, resumeId);
    await resumes.saveDraft(userId, resumeId, {
      summary: [],
      experiences: [],
      skills: ['Kubernetes'],
      education: [],
      certifications: [],
      projects: [],
      languages: [],
    });
    const { rows } = await t.db.pool.query('SELECT content FROM resumes WHERE id = $1', [resumeId]);
    expect(JSON.stringify(rows[0].content)).not.toContain('Kubernetes');
    expect((await resumes.find(userId, resumeId))?.content?.skills).toEqual(['Kubernetes']);
  });

  it('a chave fica só no bucket de chaves, e cifrada', async () => {
    const { userId } = await setup('cif-bucket@example.com');
    const name = keyObjectName(userId);
    expect(await t.storage.head(name)).toBeNull();
    const wrapped = await t.keyStorage.getBytes(name);
    expect(wrapped.byteLength).toBeGreaterThan(32);
  });

  it('um valor copiado para outra conta não abre', async () => {
    const a = await setup('cif-a@example.com');
    const b = await setup('cif-b@example.com');
    const stolen = await rawFact(a.userId);
    const other = await t.cipher.forUser(b.userId);
    expect(() => other.openJson('profile_facts.data', stolen)).toThrow();
  });

  it('depois do expurgo, a chave some e uma cópia antiga do banco não abre mais', async () => {
    const email = 'cif-expurgo@example.com';
    const { cookie, userId } = await setup(email);
    const backup = await rawFact(userId);
    await deleteAccount(cookie, email);
    await purge.run(t.purgeQueue.jobs[0]!, { isLastAttempt: false });

    expect(await t.keyStorage.head(keyObjectName(userId))).toBeNull();
    // Um processo novo, com a chave mestra certa e sem nada em memória.
    const fresh = createFieldCipher({
      db: t.db.db,
      keyStorage: t.keyStorage,
      masterKeyBase64: t.masterKeyBase64,
    });
    await expect(
      fresh.forUser(userId).then((c) => c.openJson('profile_facts.data', backup)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await t.keyStorage.head(keyObjectName(userId))).toBeNull();
  });
});

describe('exportação', () => {
  it('gera o ZIP com os dados, sem senha nem sessão, e baixa pela URL', async () => {
    const email = 'exp-zip@example.com';
    const { cookie, userId } = await setup(email);
    const created = await t.call(cookie, 'POST', '/v1/privacy/export');
    expect(created.statusCode).toBe(202);
    expect(created.json()).toMatchObject({ status: 'pending', downloadUrl: null });
    expect(Object.keys(t.exportQueue.jobs[0]!).sort()).toEqual(['exportId', 'userId']);

    expect(await exporter.run(t.exportQueue.jobs[0]!, { isLastAttempt: false })).toBe('ready');
    const [item] = (await t.call(cookie, 'GET', '/v1/privacy/exports')).json();
    expect(item.status).toBe('ready');
    const download = await fetch(item.downloadUrl as string);
    expect(download.status).toBe(200);

    const zip = await JSZip.loadAsync(await download.arrayBuffer());
    const raw = await zip.file('dados.json')!.async('string');
    const data = JSON.parse(raw);
    expect(data.user).toMatchObject({ id: userId, email });
    expect(data.profile_facts[0].data).toEqual({ name: 'React' });
    expect(data.auth_identities).toEqual([
      { providerId: 'credential', createdAt: expect.any(String) },
    ]);
    expect(raw).not.toContain('$argon2');
    expect(raw).not.toContain('objectKey');
    const session = await t.db.pool.query('SELECT token FROM sessions WHERE user_id = $1', [
      userId,
    ]);
    expect(raw).not.toContain(session.rows[0].token);
  });

  it('toda tabela com usuário foi considerada na exportação', async () => {
    const known = [...EXPORTED_TABLES, ...NOT_EXPORTED_TABLES, ...PARTIALLY_EXPORTED_TABLES].sort();
    expect(await userTables()).toEqual(known);
  });

  it('outra conta não vê a exportação, e os dados de cada uma ficam separados', async () => {
    const a = await setup('exp-a@example.com');
    const b = await setup('exp-b@example.com');
    await t.call(a.cookie, 'POST', '/v1/privacy/export');
    expect((await t.call(b.cookie, 'GET', '/v1/privacy/exports')).json()).toEqual([]);
    const { data } = await new DrizzleAccountDataReader(t.db.db, t.cipher).read(a.userId);
    expect(JSON.stringify(data)).not.toContain(b.userId);
  });

  it('exige login recente', async () => {
    const { cookie, userId } = await setup('exp-recente@example.com');
    await makeSessionOld(userId);
    expect((await t.call(cookie, 'POST', '/v1/privacy/export')).statusCode).toBe(403);
    expect(t.exportQueue.jobs).toEqual([]);
  });

  it('a exclusão da conta leva junto os arquivos exportados', async () => {
    const email = 'exp-apaga@example.com';
    const { cookie, userId } = await setup(email);
    await t.call(cookie, 'POST', '/v1/privacy/export');
    await exporter.run(t.exportQueue.jobs[0]!, { isLastAttempt: false });
    const key = `users/${userId}/exports/${t.exportQueue.jobs[0]!.exportId}.zip`;
    expect(await t.storage.head(key)).not.toBeNull();

    await deleteAccount(cookie, email);
    await purge.run(t.purgeQueue.jobs[0]!, { isLastAttempt: false });
    expect(await t.storage.head(key)).toBeNull();
  });
});
