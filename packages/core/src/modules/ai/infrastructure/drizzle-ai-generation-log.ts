import { schema, sql, withUserContext, type Database } from '@linkediner/db';
import { newId } from '../../shared';
import type { AiGenerationLog, AiGenerationRecord } from '../application/ports/ai-generation-log';

const { aiGenerations } = schema;

export class DrizzleAiGenerationLog implements AiGenerationLog {
  constructor(private readonly db: Database) {}

  async record(entry: AiGenerationRecord): Promise<void> {
    await withUserContext(this.db, entry.userId, (tx) =>
      tx.insert(aiGenerations).values({
        id: newId(),
        userId: entry.userId,
        task: entry.task,
        provider: entry.usage.provider,
        model: entry.usage.model,
        promptId: entry.usage.promptId,
        promptVersion: entry.usage.promptVersion,
        inputHash: entry.inputHash,
        output: entry.output,
        validation: entry.validation,
        tokensIn: entry.usage.tokensIn,
        tokensOut: entry.usage.tokensOut,
        latencyMs: entry.usage.latencyMs,
      }),
    );
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const rows = await this.db
      .delete(aiGenerations)
      .where(sql`${aiGenerations.createdAt} < ${cutoff.toISOString()}`)
      .returning({ id: aiGenerations.id });
    return rows.length;
  }
}
