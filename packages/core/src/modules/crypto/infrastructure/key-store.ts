import { eq, schema, sql, type Database } from '@linkediner/db';
import {
  decodeMasterKey,
  FieldCipher,
  type KeyCreationGuard,
  type KeyStore,
} from '../application/field-cipher';

/** O que o armazenamento de chaves usa do storage. */
export interface KeyObjectStorage {
  head(key: string): Promise<unknown>;
  getBytes(key: string): Promise<Uint8Array>;
  putBytes(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export const keyObjectName = (userId: string) => `user-keys/${userId}`;

/**
 * Guarda as chaves cifradas num bucket só delas, fora dos backups do banco. Se a chave ficasse numa
 * tabela, os backups teriam a chave junto com os dados, e destruí-la não adiantaria (ADR 0020).
 * O bucket não pode ter versionamento nem regra de expiração.
 */
export class ObjectKeyStore implements KeyStore {
  constructor(private readonly storage: KeyObjectStorage) {}

  async get(userId: string) {
    const name = keyObjectName(userId);
    return (await this.storage.head(name)) ? this.storage.getBytes(name) : null;
  }

  put(userId: string, wrappedKey: Uint8Array) {
    return this.storage.putBytes(keyObjectName(userId), wrappedKey, 'application/octet-stream');
  }

  delete(userId: string) {
    return this.storage.delete(keyObjectName(userId));
  }
}

/** Bloqueio do Postgres, válido entre a API e o worker. Só é usado na primeira chave do usuário. */
export class PostgresKeyCreationGuard implements KeyCreationGuard {
  constructor(private readonly db: Database) {}

  withLock<T>(userId: string, run: (accountActive: boolean) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`user-key:${userId}`}, 0))`,
      );
      const [user] = await tx
        .select({ status: schema.users.status })
        .from(schema.users)
        .where(eq(schema.users.id, userId));
      return run(user?.status === 'active');
    });
  }
}

export function createFieldCipher(deps: {
  db: Database;
  keyStorage: KeyObjectStorage;
  masterKeyBase64: string;
}): FieldCipher {
  return new FieldCipher(
    decodeMasterKey(deps.masterKeyBase64),
    new ObjectKeyStore(deps.keyStorage),
    new PostgresKeyCreationGuard(deps.db),
  );
}
