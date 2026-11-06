import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Eventos de produto, base das métricas (ADR 0022). Sem chave estrangeira e sem dado pessoal: o
 * usuário é um pseudônimo, trocado por um valor aleatório quando a conta é excluída.
 * Sem acesso do papel da aplicação. `dedupe_key` faz um evento contar uma vez só por usuário.
 */
export const productEvents = pgTable(
  'product_events',
  {
    id: uuid().primaryKey(),
    userRef: text().notNull(),
    name: text().notNull(),
    properties: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    dedupeKey: text(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex().on(t.userRef, t.dedupeKey),
    index().on(t.name, t.occurredAt),
    index().on(t.occurredAt),
  ],
);
