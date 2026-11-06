import { createHash } from 'node:crypto';
import type { AiGenerationLog, AiProvider, VersionedPrompt } from '../../ai';
import type { AuditLog } from '../../audit';
import type { DocumentRecord, DocumentRepository, ObjectStorage } from '../../documents';
import type { ConsentService } from '../../privacy';
import type { FactRepository } from '../../profile';
import type { QuotaGate } from '../../shared';
import {
  FAILURE_CODES,
  TEXT_LIMITS,
  usageKeyFor,
  type ExtractJobPayload,
} from '../domain/extraction-rules';
import { ExtractionOutput, groundFacts } from '../domain/grounding';
import { redactSensitiveData } from '../domain/redact';
import type { TextExtractor } from './ports';

export interface ExtractDocumentDeps {
  documents: Pick<DocumentRepository, 'find' | 'setStatus'>;
  storage: Pick<ObjectStorage, 'getBytes'>;
  text: TextExtractor;
  consents: Pick<ConsentService, 'status'>;
  users: { getById(userId: string): Promise<{ name: string | null } | null> };
  ai: AiProvider;
  prompt: VersionedPrompt;
  facts: Pick<FactRepository, 'replaceExtracted'>;
  generations: Pick<AiGenerationLog, 'record'>;
  quota: Pick<QuotaGate, 'refund'>;
  audit: AuditLog;
}

export type ExtractOutcome = 'processed' | 'failed' | 'skipped';

/**
 * Extrai os fatos de um documento. Roda no worker e é seguro repetir: refazer o trabalho substitui
 * os fatos não confirmados do mesmo documento.
 * Erros transitórios (ex.: provedor fora do ar) sobem para a fila tentar de novo.
 * Problemas do próprio arquivo marcam o documento como falho, sem nova tentativa.
 * Só conta no limite do plano a análise que deu certo.
 */
export class ExtractDocument {
  constructor(private readonly deps: ExtractDocumentDeps) {}

  async run(job: ExtractJobPayload, opts: { isLastAttempt: boolean }): Promise<ExtractOutcome> {
    const { userId, documentId } = job;
    const document = await this.deps.documents.find(userId, documentId);
    if (!document) {
      await this.refund(job);
      return 'skipped';
    }
    if (document.status === 'processed') return 'skipped';

    // O usuário pode ter revogado o consentimento enquanto o job esperava na fila.
    const { granted } = await this.deps.consents.status(userId);
    if (!granted.ai_processing) {
      await this.deps.documents.setStatus(userId, documentId, 'uploaded');
      await this.refund(job);
      return 'skipped';
    }

    try {
      return await this.process(job, document);
    } catch (error) {
      if (opts.isLastAttempt) await this.fail(job, FAILURE_CODES.processingError);
      throw error;
    }
  }

  private refund(job: ExtractJobPayload) {
    return this.deps.quota.refund(job.userId, 'profile.analysis', usageKeyFor(job.usageId));
  }

  private async process(job: ExtractJobPayload, document: DocumentRecord): Promise<ExtractOutcome> {
    const { userId } = job;
    const bytes = await this.deps.storage.getBytes(document.objectKey);

    let rawText: string;
    try {
      rawText = await this.deps.text.extract(document.mimeType, bytes);
    } catch {
      return this.fail(job, FAILURE_CODES.unreadable);
    }
    if (rawText.trim().length < TEXT_LIMITS.minChars) {
      // PDF escaneado: sem texto não há como remover dados sensíveis nem conferir a resposta da IA.
      return this.fail(job, FAILURE_CODES.noText);
    }
    if (rawText.length > TEXT_LIMITS.maxChars) {
      return this.fail(job, FAILURE_CODES.tooLong);
    }

    const owner = await this.deps.users.getById(userId);
    const documentText = redactSensitiveData(rawText, owner?.name);

    const { data, usage } = await this.deps.ai.generateStructured({
      task: 'extract_profile',
      prompt: this.deps.prompt,
      promptInput: { documentText, documentKind: document.kind },
      schema: ExtractionOutput,
    });

    const { facts, report } = groundFacts(data, documentText);
    const { inserted } = await this.deps.facts.replaceExtracted(userId, document.id, facts);

    await this.deps.generations.record({
      userId,
      task: 'extract_profile',
      usage,
      inputHash: createHash('sha256').update(documentText).digest('hex'),
      output: data,
      validation: { ...report },
    });
    await this.deps.documents.setStatus(userId, document.id, 'processed');
    await this.deps.audit.record({
      actorType: 'system',
      actorId: userId,
      action: 'document.processed',
      entityType: 'document',
      entityId: document.id,
      metadata: { ...report, inserted, promptVersion: usage.promptVersion },
    });
    return 'processed';
  }

  private async fail(job: ExtractJobPayload, code: string): Promise<ExtractOutcome> {
    const { userId, documentId } = job;
    await this.deps.documents.setStatus(userId, documentId, 'failed', code);
    await this.refund(job);
    await this.deps.audit.record({
      actorType: 'system',
      actorId: userId,
      action: 'document.failed',
      entityType: 'document',
      entityId: documentId,
      metadata: { failureCode: code },
    });
    return 'failed';
  }
}
