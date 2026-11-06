import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { decodeMasterKey, FieldCipher, type KeyStore } from './field-cipher';

const ALICE = 'alice';
const BOB = 'bob';
const master = randomBytes(32);

function setup({ active = true } = {}) {
  const keys = new Map<string, Uint8Array>();
  const store: KeyStore = {
    get: vi.fn(async (id) => keys.get(id) ?? null),
    put: vi.fn(async (id, bytes) => {
      keys.set(id, bytes);
    }),
    delete: vi.fn(async (id) => {
      keys.delete(id);
    }),
  };
  // Executa um por vez, como o bloqueio do Postgres.
  let queue: Promise<unknown> = Promise.resolve();
  const guard = {
    withLock<T>(_id: string, run: (accountActive: boolean) => Promise<T>) {
      const result = queue.then(() => run(active));
      queue = result.catch(() => {});
      return result;
    },
  };
  let now = 0;
  const clock = { now: () => new Date(now) };
  const cipher = new FieldCipher(master, store, guard, clock);
  return { cipher, store, keys, guard, clock, advance: (ms: number) => (now += ms) };
}

describe('campos cifrados', () => {
  it('abre o que selou, em JSON e em texto, sem deixar o conteúdo visível', async () => {
    const c = await setup().cipher.forUser(ALICE);
    const json = c.sealJson('t.data', { name: 'Reduzi custos', n: 40 });
    expect(JSON.stringify(json)).not.toContain('Reduzi');
    expect(c.openJson('t.data', json)).toEqual({ name: 'Reduzi custos', n: 40 });
    const text = c.sealText('t.span', 'trecho do currículo');
    expect(text).not.toContain('trecho');
    expect(c.openText('t.span', text)).toBe('trecho do currículo');
  });

  it('o mesmo valor nunca gera o mesmo resultado', async () => {
    const c = await setup().cipher.forUser(ALICE);
    expect(c.sealText('t', 'igual')).not.toBe(c.sealText('t', 'igual'));
  });

  it('valor gravado antes da cifragem continua legível', async () => {
    const c = await setup().cipher.forUser(ALICE);
    expect(c.openJson('t', { name: 'antigo' })).toEqual({ name: 'antigo' });
    expect(c.openJson('t', null)).toBeNull();
    expect(c.openText('t', 'antigo')).toBe('antigo');
  });

  it('não abre com outra chave, em outra coluna ou adulterado', async () => {
    const { cipher } = setup();
    const a = await cipher.forUser(ALICE);
    const b = await cipher.forUser(BOB);
    const sealed = a.sealText('t.a', 'segredo');
    expect(() => b.openText('t.a', sealed)).toThrow();
    expect(() => a.openText('t.b', sealed)).toThrow();
    const at = sealed.length - 5;
    const other = sealed[at] === 'A' ? 'B' : 'A';
    const tampered = sealed.slice(0, at) + other + sealed.slice(at + 1);
    expect(() => a.openText('t.a', tampered)).toThrow();
  });
});

describe('chave por usuário', () => {
  it('guarda a chave cifrada pela chave mestra, nunca em claro', async () => {
    const { cipher, keys } = setup();
    const before = await cipher.forUser(ALICE);
    const sealed = before.sealText('t', 'valor');
    const other = new FieldCipher(
      randomBytes(32),
      {
        get: async () => keys.get(ALICE)!,
        put: vi.fn(),
        delete: vi.fn(),
      },
      { withLock: (_id, run) => run(true) },
    );
    await expect(other.forUser(ALICE)).rejects.toThrow();
    expect(sealed).not.toContain('valor');
  });

  it('pedidos simultâneos usam a mesma chave', async () => {
    const { cipher, store } = setup();
    const [a, b] = await Promise.all([cipher.forUser(ALICE), cipher.forUser(ALICE)]);
    expect(b.openText('t', a.sealText('t', 'valor'))).toBe('valor');
    expect(store.put).toHaveBeenCalledTimes(1);
  });

  it('outro processo lê a mesma chave', async () => {
    const { cipher, store, guard } = setup();
    const sealed = (await cipher.forUser(ALICE)).sealText('t', 'valor');
    const other = new FieldCipher(master, store, guard);
    expect((await other.forUser(ALICE)).openText('t', sealed)).toBe('valor');
  });

  it('guarda a chave em memória por pouco tempo', async () => {
    const { cipher, store, advance } = setup();
    await cipher.forUser(ALICE);
    await cipher.forUser(ALICE);
    expect(store.get).toHaveBeenCalledTimes(2); // uma leitura e a conferência na criação
    advance(5 * 60 * 1000 + 1);
    await cipher.forUser(ALICE);
    expect(store.get).toHaveBeenCalledTimes(3);
  });

  it('depois de destruída, o que foi cifrado não abre mais', async () => {
    const { cipher, keys } = setup();
    const sealed = (await cipher.forUser(ALICE)).sealText('t', 'valor');
    await cipher.destroy(ALICE);
    expect(keys.has(ALICE)).toBe(false);
    // Mesmo que a conta volte a ter uma chave, ela é outra.
    await expect(cipher.forUser(ALICE).then((c) => c.openText('t', sealed))).rejects.toThrow();
  });

  it('conta em exclusão nunca ganha chave nova', async () => {
    const { cipher, store } = setup({ active: false });
    await expect(cipher.forUser(ALICE)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(store.put).not.toHaveBeenCalled();
  });
});

describe('chave mestra', () => {
  it('precisa ter 32 bytes', () => {
    expect(decodeMasterKey(randomBytes(32).toString('base64'))).toHaveLength(32);
    expect(() => decodeMasterKey(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
