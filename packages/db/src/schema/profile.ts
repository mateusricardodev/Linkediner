import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity';

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Perfil profissional: um por usuário (docs/arquitetura/03-dados.md). */
export const profiles = pgTable('profiles', {
  id: uuid().primaryKey(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  headline: text(),
  summary: text(),
  yearsExperience: integer(),
  ...timestamps,
});

export const profileLinkKind = pgEnum('profile_link_kind', [
  'linkedin',
  'github',
  'portfolio',
  'other',
]);

/** `user_id` repetido aqui para a política de RLS ficar simples e direta. */
export const profileLinks = pgTable(
  'profile_links',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kind: profileLinkKind().notNull(),
    url: text().notNull(),
    position: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index().on(t.userId), uniqueIndex().on(t.profileId, t.url)],
);

export const seniority = pgEnum('seniority', [
  'intern',
  'junior',
  'mid',
  'senior',
  'staff',
  'principal',
  'lead',
  'manager',
]);
export const currency = pgEnum('currency', ['BRL', 'USD', 'EUR']);
export const salaryPeriod = pgEnum('salary_period', ['month', 'year']);

/** Objetivos de carreira: um usuário pode ter vários (ex.: "Frontend sênior remoto Brasil" e "Full stack exterior"). */
export const careerGoals = pgTable(
  'career_goals',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    seniority: seniority().notNull(),
    targetRoles: text().array().notNull().default([]),
    locations: text().array().notNull().default([]),
    remoteOnly: boolean().notNull().default(true),
    salaryMin: integer(),
    currency: currency(),
    salaryPeriod: salaryPeriod(),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [index().on(t.userId, t.isActive)],
);
