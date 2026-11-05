import { eq, schema, withUserContext, type Database } from '@linkediner/db';

export interface UserSummary {
  id: string;
  email: string;
  name: string | null;
  locale: string;
}

/** Leitura do próprio usuário, sempre com contexto de usuário (RLS). */
export class DrizzleUserReader {
  constructor(private readonly db: Database) {}

  async getById(userId: string): Promise<UserSummary | null> {
    const [row] = await withUserContext(this.db, userId, (tx) =>
      tx
        .select({
          id: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
          locale: schema.users.locale,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId)),
    );
    return row ?? null;
  }
}
