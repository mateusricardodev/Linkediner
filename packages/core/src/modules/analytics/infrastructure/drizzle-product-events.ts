import { lt, schema, type Database } from '@linkediner/db';
import { newId } from '../../shared';
import type { ProductEventStore } from '../application/product-events';
import type { ProductEvent } from '../domain/events';

const { productEvents } = schema;

/** Usa o papel dono do banco: a tabela não tem acesso do papel da aplicação. */
export class DrizzleProductEvents implements ProductEventStore {
  constructor(
    private readonly db: Database,
    private readonly pseudonymize: (id: string) => string,
  ) {}

  async insert(userId: string, events: ProductEvent[]) {
    const userRef = this.pseudonymize(userId);
    await this.db
      .insert(productEvents)
      .values(
        events.map((event) => ({
          id: newId(),
          userRef,
          name: event.name,
          properties: event.properties ?? {},
          dedupeKey: event.dedupeKey ?? null,
        })),
      )
      .onConflictDoNothing({ target: [productEvents.userRef, productEvents.dedupeKey] });
  }

  async deleteOlderThan(cutoff: Date) {
    const rows = await this.db
      .delete(productEvents)
      .where(lt(productEvents.occurredAt, cutoff))
      .returning({ id: productEvents.id });
    return rows.length;
  }
}
