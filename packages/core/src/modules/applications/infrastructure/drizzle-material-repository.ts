import { and, asc, eq, schema, withUserContext, type Database } from '@linkediner/db';
import type { FieldCipher, UserCipher } from '../../crypto';
import type { ApplicationMaterial, MaterialContent } from '../domain/material';
import type { MaterialRepository } from '../application/material-service';

const { applicationMaterials } = schema;

const CONTENT = 'application_materials.content';

const toMaterial = (
  c: UserCipher,
  r: typeof applicationMaterials.$inferSelect,
): ApplicationMaterial => ({
  id: r.id,
  applicationId: r.applicationId,
  kind: r.kind,
  status: r.status,
  questions: r.questions,
  content: c.openJson<MaterialContent | null>(CONTENT, r.content) ?? null,
  failureCode: r.failureCode,
});

export class DrizzleMaterialRepository implements MaterialRepository {
  constructor(
    private readonly db: Database,
    private readonly cipher: FieldCipher,
  ) {}

  private owned(userId: string, id: string) {
    return and(eq(applicationMaterials.id, id), eq(applicationMaterials.userId, userId));
  }

  async upsertGenerating(
    userId: string,
    material: Parameters<MaterialRepository['upsertGenerating']>[1],
  ) {
    const c = await this.cipher.forUser(userId);
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .insert(applicationMaterials)
        .values({ ...material, userId })
        .onConflictDoUpdate({
          target: [applicationMaterials.applicationId, applicationMaterials.kind],
          set: {
            status: 'generating',
            content: null,
            failureCode: null,
            questions: material.questions,
          },
        })
        .returning();
      return toMaterial(c, row!);
    });
  }

  async find(userId: string, id: string) {
    const c = await this.cipher.forUser(userId);
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx.select().from(applicationMaterials).where(this.owned(userId, id));
      return row ? toMaterial(c, row) : null;
    });
  }

  async list(userId: string, applicationId: string) {
    const c = await this.cipher.forUser(userId);
    return withUserContext(this.db, userId, async (tx) =>
      (
        await tx
          .select()
          .from(applicationMaterials)
          .where(
            and(
              eq(applicationMaterials.applicationId, applicationId),
              eq(applicationMaterials.userId, userId),
            ),
          )
          .orderBy(asc(applicationMaterials.createdAt), asc(applicationMaterials.id))
      ).map((row) => toMaterial(c, row)),
    );
  }

  async saveReady(userId: string, id: string, content: MaterialContent) {
    const c = await this.cipher.forUser(userId);
    await withUserContext(this.db, userId, (tx) =>
      tx
        .update(applicationMaterials)
        .set({ status: 'ready', content: c.sealJson(CONTENT, content), failureCode: null })
        .where(this.owned(userId, id)),
    );
  }

  async markFailed(userId: string, id: string, failureCode: string) {
    await withUserContext(this.db, userId, (tx) =>
      tx
        .update(applicationMaterials)
        .set({ status: 'failed', content: null, failureCode })
        .where(this.owned(userId, id)),
    );
  }

  async updateContent(userId: string, id: string, change: (content: MaterialContent) => void) {
    const c = await this.cipher.forUser(userId);
    return withUserContext(this.db, userId, async (tx) => {
      const [row] = await tx
        .select()
        .from(applicationMaterials)
        .where(this.owned(userId, id))
        .for('update');
      if (!row?.content) return null;
      const content = c.openJson<MaterialContent>(CONTENT, row.content);
      change(content);
      const [updated] = await tx
        .update(applicationMaterials)
        .set({ content: c.sealJson(CONTENT, content) })
        .where(this.owned(userId, id))
        .returning();
      return toMaterial(c, updated!);
    });
  }

  delete(userId: string, id: string) {
    return withUserContext(this.db, userId, async (tx) => {
      const rows = await tx
        .delete(applicationMaterials)
        .where(this.owned(userId, id))
        .returning({ id: applicationMaterials.id });
      return rows.length > 0;
    });
  }
}
