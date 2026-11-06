import { and, asc, eq, inArray, schema, withUserContext, type Database } from '@linkediner/db';
import type { FieldCipher, UserCipher } from '../../crypto';
import { newId } from '../../shared';
import {
  fingerprintFact,
  type FactData,
  type FactType,
  type NewFact,
  type ProfileFact,
} from '../domain/facts';
import type { FactRepository } from '../application/ports/fact-repository';

const { profileFacts, profiles } = schema;

const DATA = 'profile_facts.data';
const SPAN = 'profile_facts.source_span';

const toFact = (c: UserCipher, r: typeof profileFacts.$inferSelect): ProfileFact => ({
  id: r.id,
  type: r.type,
  data: c.openJson<FactData>(DATA, r.data),
  sourceDocumentId: r.sourceDocumentId,
  sourceSpan: r.sourceSpan === null ? null : c.openText(SPAN, r.sourceSpan),
  verification: r.verification,
  createdAt: r.createdAt,
});

const isUniqueViolation = (error: unknown) =>
  (error as { cause?: { code?: string } }).cause?.code === '23505';

export class DrizzleFactRepository implements FactRepository {
  constructor(
    private readonly db: Database,
    private readonly cipher: FieldCipher,
  ) {}

  async list(userId: string) {
    const c = await this.cipher.forUser(userId);
    return withUserContext(this.db, userId, async (tx) =>
      (
        await tx
          .select()
          .from(profileFacts)
          .where(eq(profileFacts.userId, userId))
          // Fatos da mesma extração têm o mesmo created_at: o ID (UUID v7) mantém a ordem estável.
          .orderBy(asc(profileFacts.createdAt), asc(profileFacts.id))
      ).map((row) => toFact(c, row)),
    );
  }

  async find(userId: string, factId: string) {
    const c = await this.cipher.forUser(userId);
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .select()
        .from(profileFacts)
        .where(and(eq(profileFacts.id, factId), eq(profileFacts.userId, userId)));
      return row ? toFact(c, row) : null;
    });
  }

  async replaceExtracted(userId: string, documentId: string, facts: NewFact[]) {
    const c = await this.cipher.forUser(userId);
    return withUserContext(this.db, userId, async (tx) => {
      await tx
        .insert(profiles)
        .values({ id: newId(), userId })
        .onConflictDoNothing({ target: profiles.userId });
      const [profile] = await tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.userId, userId));

      await tx
        .delete(profileFacts)
        .where(
          and(
            eq(profileFacts.userId, userId),
            eq(profileFacts.sourceDocumentId, documentId),
            eq(profileFacts.verification, 'extracted'),
          ),
        );
      if (facts.length === 0) return { inserted: 0 };

      const rows = await tx
        .insert(profileFacts)
        .values(
          facts.map((fact) => ({
            id: newId(),
            userId,
            profileId: profile!.id,
            type: fact.type,
            data: c.sealJson(DATA, fact.data),
            fingerprint: fingerprintFact(fact.type, fact.data),
            sourceDocumentId: documentId,
            sourceSpan: c.sealText(SPAN, fact.sourceSpan),
            verification: 'extracted' as const,
          })),
        )
        .onConflictDoNothing({ target: [profileFacts.profileId, profileFacts.fingerprint] })
        .returning({ id: profileFacts.id });
      return { inserted: rows.length };
    });
  }

  async addConfirmed(userId: string, fact: { type: FactType; data: FactData }) {
    const c = await this.cipher.forUser(userId);
    await withUserContext(this.db, userId, async (tx) => {
      await tx
        .insert(profiles)
        .values({ id: newId(), userId })
        .onConflictDoNothing({ target: profiles.userId });
      const [profile] = await tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.userId, userId));
      await tx
        .insert(profileFacts)
        .values({
          id: newId(),
          userId,
          profileId: profile!.id,
          type: fact.type,
          data: c.sealJson(DATA, fact.data),
          fingerprint: fingerprintFact(fact.type, fact.data),
          verification: 'user_confirmed',
        })
        .onConflictDoNothing({ target: [profileFacts.profileId, profileFacts.fingerprint] });
    });
  }

  async update(
    userId: string,
    factId: string,
    change: Parameters<FactRepository['update']>[2],
  ): Promise<ProfileFact | null> {
    const c = await this.cipher.forUser(userId);
    const { data, ...rest } = change;
    try {
      return await withUserContext(this.db, userId, async (tx) => {
        const [row] = await tx
          .update(profileFacts)
          .set({ ...rest, ...(data ? { data: c.sealJson(DATA, data) } : {}) })
          .where(and(eq(profileFacts.id, factId), eq(profileFacts.userId, userId)))
          .returning();
        return toFact(c, row!);
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async deleteUnconfirmedForDocument(userId: string, documentId: string) {
    await withUserContext(this.db, userId, (tx) =>
      tx
        .delete(profileFacts)
        .where(
          and(
            eq(profileFacts.userId, userId),
            eq(profileFacts.sourceDocumentId, documentId),
            inArray(profileFacts.verification, ['extracted', 'suggested']),
          ),
        ),
    );
  }
}
