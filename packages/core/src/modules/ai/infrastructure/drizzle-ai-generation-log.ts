import { schema, sql, withUserContext, type Database } from '@linkediner/db';
import type { FieldCipher } from '../../crypto';
import { newId } from '../../shared';
import type { AiGenerationLog, AiGenerationRecord } from '../application/ports/ai-generation-log';

const { aiGenerations } = schema;

export class DrizzleAiGenerationLog implements AiGenerationLog {
  constructor(
    private readonly db: Database,
    private readonly cipher: FieldCipher,
  ) {}

  async record(entry: AiGenerationRecord): Promise<void> {
    const c = await this.cipher.forUser(entry.userId);
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
        output: c.sealJson('ai_generations.output', entry.output),
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
