import { date, index, jsonb, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';

/**
 * As vagas do dia (ADR 0037): uma vez por dia, as 3 a 5 vagas do catálogo mais compatíveis com o
 * perfil, guardadas para ficarem as mesmas o dia todo. O snapshot traz o título, a empresa, o link
 * e a nota de cada vaga; como a nota revela o quanto o perfil combina, fica criptografado por
 * usuário. Só um snapshot por usuário por dia.
 */
export const dailyJobPicks = pgTable(
  'daily_job_picks',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Dia da seleção (UTC). */
    day: date({ mode: 'string' }).notNull(),
    /** Objetivo de carreira usado como alvo. */
    goalId: uuid(),
    /** Vagas escolhidas, criptografadas (título, empresa, link, data, nota, explicação). */
    items: jsonb().$type<unknown>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('daily_job_picks_user_day').on(t.userId, t.day),
    index().on(t.userId, t.createdAt),
  ],
);
