import type { Database } from '@linkediner/db';
import { schema } from '@linkediner/db';
import { newId } from '../../shared';
import type { AuditEntry, AuditLog } from '../application/ports/audit-log';

export class DrizzleAuditLog implements AuditLog {
  constructor(
    private readonly db: Database,
    private readonly pseudonymize: (id: string) => string,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.insert(schema.auditLogs).values({
      id: newId(),
      actorType: entry.actorType,
      actorId: entry.actorId ? this.pseudonymize(entry.actorId) : null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
    });
  }
}
