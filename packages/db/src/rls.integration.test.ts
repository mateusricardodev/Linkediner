import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUserContext } from './client';
import { auditLogs, consents, users } from './schema';
import { startTestDatabase } from './testing';

const alice = '0193b2b0-0000-7000-8000-00000000000a';
const bob = '0193b2b0-0000-7000-8000-00000000000b';

let ctx: Awaited<ReturnType<typeof startTestDatabase>>;

/** O Drizzle embrulha o erro do Postgres; a mensagem original fica em `cause`. */
async function pgErrorOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return String((e as { cause?: { message?: string } }).cause?.message ?? e);
  }
  throw new Error('Era esperado um erro do Postgres');
}

beforeAll(async () => {
  ctx = await startTestDatabase();
  // Inserção administrativa (sem contexto de usuário), como faria o cadastro.
  await ctx.handle.db.insert(users).values([
    { id: alice, email: 'alice@example.com' },
    { id: bob, email: 'bob@example.com' },
  ]);
}, 120_000);

afterAll(async () => ctx?.stop());

describe('Row Level Security', () => {
  it('extensões instaladas', async () => {
    const res = await ctx.handle.pool.query(
      "SELECT extname FROM pg_extension WHERE extname IN ('vector','pgcrypto') ORDER BY 1",
    );
    expect(res.rows.map((r) => r.extname)).toEqual(['pgcrypto', 'vector']);
  });

  it('usuário enxerga apenas a própria linha em users', async () => {
    const rows = await withUserContext(ctx.handle.db, alice, (tx) => tx.select().from(users));
    expect(rows.map((r) => r.id)).toEqual([alice]);
  });

  it('usuário não consegue alterar outro usuário', async () => {
    await withUserContext(ctx.handle.db, alice, (tx) =>
      tx.update(users).set({ name: 'invasor' }).where(eq(users.id, bob)),
    );
    const [b] = await ctx.handle.db.select().from(users).where(eq(users.id, bob));
    expect(b?.name).toBeNull();
  });

  it('usuário não consegue criar consentimento em nome de outro', async () => {
    const message = await pgErrorOf(
      withUserContext(ctx.handle.db, alice, (tx) =>
        tx.insert(consents).values({
          id: '0193b2b0-0000-7000-8000-0000000000c1',
          userId: bob,
          purpose: 'terms',
          version: 'v1',
          granted: true,
        }),
      ),
    );
    expect(message).toMatch(/row-level security/);
  });

  it('consentimentos de cada usuário ficam isolados', async () => {
    await withUserContext(ctx.handle.db, alice, (tx) =>
      tx.insert(consents).values({
        id: '0193b2b0-0000-7000-8000-0000000000c2',
        userId: alice,
        purpose: 'terms',
        version: 'v1',
        granted: true,
      }),
    );
    const bobSees = await withUserContext(ctx.handle.db, bob, (tx) => tx.select().from(consents));
    expect(bobSees).toHaveLength(0);
  });

  it('sem contexto de usuário, o papel da aplicação não vê nada', async () => {
    const rows = await withUserContext(ctx.handle.db, '', (tx) => tx.select().from(users));
    expect(rows).toHaveLength(0);
  });

  it('auditoria é somente inserção para a aplicação', async () => {
    await withUserContext(ctx.handle.db, alice, (tx) =>
      tx.insert(auditLogs).values({
        id: '0193b2b0-0000-7000-8000-0000000000d1',
        actorType: 'user',
        actorId: 'pseudo',
        action: 'consent.granted',
      }),
    );
    const message = await pgErrorOf(
      withUserContext(ctx.handle.db, alice, (tx) => tx.select().from(auditLogs)),
    );
    expect(message).toMatch(/permission denied/);
  });
});

describe('tabelas de autenticação', () => {
  it('o papel da aplicação não lê sessões, identidades nem verificações', async () => {
    for (const table of ['sessions', 'auth_identities', 'verifications']) {
      const message = await pgErrorOf(
        withUserContext(ctx.handle.db, alice, (tx) =>
          tx.execute(sql.raw(`SELECT * FROM ${table}`)),
        ),
      );
      expect(message).toMatch(/permission denied/);
    }
  });
});
