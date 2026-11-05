import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { profiles } from './profile';

/**
 * Histórico do score do perfil. Uma nova linha só entra quando o resultado muda,
 * o que permite medir a evolução sem acumular registros repetidos.
 */
export const profileScores = pgTable(
  'profile_scores',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    score: integer().notNull(),
    rubricVersion: text().notNull(),
    factors: jsonb().$type<unknown[]>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);
