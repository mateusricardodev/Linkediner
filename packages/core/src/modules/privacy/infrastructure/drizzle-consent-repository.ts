import { asc, eq, schema, withUserContext, type Database } from '@linkediner/db';
import { newId } from '../../shared';
import type { ConsentRecord } from '../domain/consent';
import type { ConsentRepository } from '../application/ports/consent-repository';

/** Toda leitura e escrita passa por withUserContext: o RLS garante o isolamento entre usuários. */
export class DrizzleConsentRepository implements ConsentRepository {
  constructor(private readonly db: Database) {}

  async history(userId: string): Promise<ConsentRecord[]> {
    const rows = await withUserContext(this.db, userId, (tx) =>
      tx
        .select()
        .from(schema.consents)
        .where(eq(schema.consents.userId, userId))
        .orderBy(asc(schema.consents.createdAt)),
    );
    return rows.map((r) => ({
      purpose: r.purpose,
      version: r.version,
      granted: r.granted,
      createdAt: r.createdAt,
    }));
  }

  async append(
    userId: string,
    record: Pick<ConsentRecord, 'purpose' | 'version' | 'granted'>,
  ): Promise<void> {
    await withUserContext(this.db, userId, (tx) =>
      tx.insert(schema.consents).values({ id: newId(), userId, ...record }),
    );
  }
}
