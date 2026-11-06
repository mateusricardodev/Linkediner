import { and, eq, lt, ne, schema, type Database } from '@linkediner/db';
import { newId } from '../../shared';
import type { AccountDeletionRepository } from '../application/account-deletion';
import type { DeletionRequest } from '../domain/account-data';

const { auditLogs, deletionRequests, productEvents, sessions, users } = schema;

const toRequest = (r: typeof deletionRequests.$inferSelect): DeletionRequest => ({
  id: r.id,
  userId: r.userId,
  userRef: r.userRef,
  status: r.status,
});

/**
 * Usa o papel dono do banco, como a autenticação: mexe em sessões, usuários e auditoria, que o
 * papel da aplicação não pode alterar.
 */
export class DrizzleAccountDeletionRepository implements AccountDeletionRepository {
  constructor(private readonly db: Database) {}

  async emailOf(userId: string) {
    const [row] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    return row?.email ?? null;
  }

  begin(userId: string, request: { id: string; userRef: string }) {
    return this.db.transaction(async (tx) => {
      await tx.update(users).set({ status: 'pending_deletion' }).where(eq(users.id, userId));
      await tx.delete(sessions).where(eq(sessions.userId, userId));
      await tx
        .insert(deletionRequests)
        .values({ ...request, userId })
        .onConflictDoNothing({ target: deletionRequests.userId });
      const [row] = await tx
        .select()
        .from(deletionRequests)
        .where(eq(deletionRequests.userId, userId));
      return toRequest(row!);
    });
  }

  async find(id: string) {
    const [row] = await this.db.select().from(deletionRequests).where(eq(deletionRequests.id, id));
    return row ? toRequest(row) : null;
  }

  async complete(request: DeletionRequest, report: Record<string, number>) {
    await this.db.transaction(async (tx) => {
      await tx
        .update(deletionRequests)
        .set({ status: 'completed', completedAt: new Date(), report })
        .where(eq(deletionRequests.id, request.id));
      await tx.insert(auditLogs).values({
        id: newId(),
        actorType: 'system',
        actorId: request.userRef,
        action: 'account.purged',
        entityType: 'deletion_request',
        entityId: request.id,
        metadata: report,
      });
      // As métricas seguem valendo no agregado, sem como ligar os eventos a esta conta.
      await tx
        .update(productEvents)
        .set({ userRef: `anon:${newId()}` })
        .where(eq(productEvents.userRef, request.userRef));
      if (!request.userId) return;
      // `actor_id` já é pseudônimo. O ID real só aparece como entidade nos eventos do próprio usuário.
      await tx
        .update(auditLogs)
        .set({ entityId: request.userRef })
        .where(and(eq(auditLogs.entityType, 'user'), eq(auditLogs.entityId, request.userId)));
      await tx.delete(users).where(eq(users.id, request.userId));
    });
  }

  async markFailed(id: string) {
    await this.db
      .update(deletionRequests)
      .set({ status: 'failed' })
      .where(and(eq(deletionRequests.id, id), ne(deletionRequests.status, 'completed')));
  }

  async listOpen(before: Date) {
    const rows = await this.db
      .select()
      .from(deletionRequests)
      .where(
        and(ne(deletionRequests.status, 'completed'), lt(deletionRequests.requestedAt, before)),
      );
    return rows.map(toRequest);
  }
}
