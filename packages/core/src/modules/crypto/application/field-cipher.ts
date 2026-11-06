import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError, systemClock, type Clock } from '../../shared';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 'v1';
const TEXT_PREFIX = `$sealed:${VERSION}.`;
const JSON_FIELD = '$sealed';
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_USERS = 1000;

/** Chaves cifradas, guardadas fora do banco e dos backups dele (ADR 0020). */
export interface KeyStore {
  get(userId: string): Promise<Uint8Array | null>;
  put(userId: string, wrappedKey: Uint8Array): Promise<void>;
  delete(userId: string): Promise<void>;
}

/**
 * Garante que dois processos não criem chaves diferentes para o mesmo usuário: a última venceria,
 * e o que a outra cifrou se perderia. Informa também se a conta está ativa.
 */
export interface KeyCreationGuard {
  withLock<T>(userId: string, run: (accountActive: boolean) => Promise<T>): Promise<T>;
}

function seal(key: Uint8Array, aad: string, plain: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

function open(key: Uint8Array, aad: string, sealed: string): Buffer {
  const raw = Buffer.from(sealed, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
}

export function decodeMasterKey(base64: string): Uint8Array {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== KEY_BYTES) throw new Error('A chave mestra precisa ter 32 bytes.');
  return key;
}

/**
 * Cifra campos com a chave de um usuário. É síncrona de propósito: a chave é obtida antes de abrir
 * a transação, para nenhuma chamada ao storage segurar uma conexão ou um bloqueio do banco.
 * Cada valor fica preso ao usuário e à coluna: uma cópia para outra linha ou conta não abre.
 */
export class UserCipher {
  constructor(
    private readonly key: Uint8Array,
    private readonly userId: string,
  ) {}

  private aad(column: string) {
    return `${this.userId}|${column}`;
  }

  sealJson(column: string, value: unknown): Record<string, string> {
    const plain = Buffer.from(JSON.stringify(value));
    return { [JSON_FIELD]: `${VERSION}.${seal(this.key, this.aad(column), plain)}` };
  }

  /** Valor gravado antes da cifragem volta como está. */
  openJson<T>(column: string, stored: unknown): T {
    const sealed = (stored as Record<string, unknown> | null)?.[JSON_FIELD];
    if (typeof sealed !== 'string') return stored as T;
    const body = sealed.slice(VERSION.length + 1);
    return JSON.parse(open(this.key, this.aad(column), body).toString()) as T;
  }

  sealText(column: string, value: string): string {
    return TEXT_PREFIX + seal(this.key, this.aad(column), Buffer.from(value));
  }

  openText(column: string, stored: string): string {
    if (!stored.startsWith(TEXT_PREFIX)) return stored;
    return open(this.key, this.aad(column), stored.slice(TEXT_PREFIX.length)).toString();
  }
}

/** Chave por usuário para o crypto-shredding: sem ela, os campos cifrados deixam de ser legíveis. */
export class FieldCipher {
  private readonly cache = new Map<string, { key: Uint8Array; expiresAt: number }>();

  constructor(
    private readonly masterKey: Uint8Array,
    private readonly store: KeyStore,
    private readonly guard: KeyCreationGuard,
    private readonly clock: Clock = systemClock,
  ) {}

  async forUser(userId: string): Promise<UserCipher> {
    return new UserCipher(await this.keyOf(userId), userId);
  }

  /** Destruir a chave não pode ser desfeito. Só o expurgo da conta chama isto. */
  async destroy(userId: string): Promise<void> {
    await this.store.delete(userId);
    this.cache.delete(userId);
  }

  private wrapAad(userId: string) {
    return `user-key|${userId}`;
  }

  private async keyOf(userId: string): Promise<Uint8Array> {
    const now = this.clock.now().getTime();
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > now) return cached.key;

    const key = (await this.load(userId)) ?? (await this.create(userId));
    if (this.cache.size >= CACHE_MAX_USERS) {
      this.cache.delete(this.cache.keys().next().value!);
    }
    this.cache.set(userId, { key, expiresAt: now + CACHE_TTL_MS });
    return key;
  }

  private async load(userId: string): Promise<Uint8Array | null> {
    const wrapped = await this.store.get(userId);
    if (!wrapped) return null;
    const text = Buffer.from(wrapped).toString();
    return open(this.masterKey, this.wrapAad(userId), text);
  }

  private create(userId: string): Promise<Uint8Array> {
    return this.guard.withLock(userId, async (accountActive) => {
      const existing = await this.load(userId);
      if (existing) return existing;
      // Conta em exclusão nunca ganha chave nova: isso desfaria a destruição da anterior.
      if (!accountActive) throw new AppError('CONFLICT', 'Esta conta não está ativa.');
      const key = randomBytes(KEY_BYTES);
      const wrapped = seal(this.masterKey, this.wrapAad(userId), key);
      await this.store.put(userId, Buffer.from(wrapped));
      return key;
    });
  }
}
