import type { AuditLog } from '../../audit';
import type { ConsentService } from '../../privacy';
import type { JobRepository } from '../../jobs';
import type { FactRepository } from '../../profile';
import { AppError, newId, systemClock, type Clock, type QuotaGate } from '../../shared';
import { pendingSuggestions } from '../domain/export-model';
import {
  findItem,
  RESUME_FAILURES,
  resumeUsageKey,
  type Resume,
  type ResumeOptions,
} from '../domain/resume';
import type { ResumeQueue, ResumeRepository } from './ports/resume-repository';

export type ItemDecision = { action: 'confirm'; text?: string } | { action: 'remove' };

const notFound = () => new AppError('NOT_FOUND', 'Currículo não encontrado.');

export class ResumeService {
  constructor(
    private readonly repo: ResumeRepository,
    private readonly facts: Pick<FactRepository, 'list' | 'addConfirmed'>,
    private readonly consents: Pick<ConsentService, 'status'>,
    private readonly queue: ResumeQueue,
    private readonly audit: AuditLog,
    private readonly quota: QuotaGate,
    private readonly jobs: Pick<JobRepository, 'find'>,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Pede um currículo novo, geral ou orientado por uma vaga salva. A geração roda no worker. */
  async request(
    userId: string,
    options: ResumeOptions = { language: 'pt', jobId: null },
  ): Promise<Resume> {
    const { granted } = await this.consents.status(userId);
    if (!granted.ai_processing) {
      throw new AppError(
        'CONSENT_REQUIRED',
        'Autorize o processamento por IA para gerar o currículo.',
        { missing: ['ai_processing'] },
      );
    }
    const facts = await this.facts.list(userId);
    const usable = facts.some(
      (f) => f.verification === 'extracted' || f.verification === 'user_confirmed',
    );
    if (!usable)
      throw new AppError('CONFLICT', 'Envie um currículo antes de gerar uma nova versão.');

    if (options.jobId) {
      const job = await this.jobs.find(userId, options.jobId);
      if (!job) throw new AppError('NOT_FOUND', 'Vaga não encontrada.');
      if (job.status !== 'ready') {
        throw new AppError(
          'CONFLICT',
          'Esta vaga ainda está em análise. Tente de novo em instantes.',
        );
      }
    }

    const existing = (await this.repo.list(userId)).find((r) => r.status === 'generating');
    if (existing) return existing;

    const id = newId();
    await this.quota.consume(userId, 'resume.improved', resumeUsageKey(id));
    const resume = await this.repo.insertGenerating(userId, id, options);
    try {
      await this.queue.enqueue({ userId, resumeId: resume.id });
    } catch {
      await this.repo.markFailed(userId, resume.id, RESUME_FAILURES.processingError);
      await this.quota.refund(userId, 'resume.improved', resumeUsageKey(id));
      throw new AppError(
        'DEPENDENCY_UNAVAILABLE',
        'Não foi possível iniciar a geração. Tente de novo.',
      );
    }
    return resume;
  }

  list(userId: string): Promise<Resume[]> {
    return this.repo.list(userId);
  }

  async get(userId: string, id: string): Promise<Resume> {
    const resume = await this.repo.find(userId, id);
    if (!resume) throw notFound();
    return resume;
  }

  /**
   * O usuário é a autoridade sobre o que afirma: confirma, corrige ou remove cada frase.
   * Uma sugestão confirmada vira fato, e pode ser citada em gerações futuras.
   */
  async decideItem(
    userId: string,
    resumeId: string,
    itemId: string,
    decision: ItemDecision,
  ): Promise<Resume> {
    let confirmedSuggestion: string | undefined;
    let itemFound = false;
    const updated = await this.repo.updateContent(userId, resumeId, (content) => {
      const item = findItem(content, itemId);
      if (!item) return;
      itemFound = true;
      if (decision.action === 'remove') {
        item.status = 'removed';
        return;
      }
      if (decision.text !== undefined && decision.text !== item.text) {
        // A primeira versão gerada fica guardada: é com ela que a próxima geração aprende.
        item.originalText ??= item.text;
        item.text = decision.text;
      }
      if (item.status === 'suggested' || decision.text !== undefined)
        confirmedSuggestion = item.text;
      item.status = 'user_confirmed';
      item.reason = null;
    });
    if (!updated) throw notFound();
    if (!itemFound) throw new AppError('NOT_FOUND', 'Frase não encontrada neste currículo.');

    if (confirmedSuggestion) {
      await this.facts.addConfirmed(userId, {
        type: 'achievement',
        data: { description: confirmedSuggestion },
      });
    }
    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: decision.action === 'remove' ? 'resume.item_removed' : 'resume.item_confirmed',
      entityType: 'resume',
      entityId: resumeId,
    });
    return updated;
  }

  /** O usuário aprova o currículo depois de decidir sobre todas as sugestões. */
  async approve(userId: string, id: string): Promise<Resume> {
    const resume = await this.get(userId, id);
    if (resume.status === 'approved') return resume;
    if (resume.status !== 'draft' || !resume.content) {
      throw new AppError('CONFLICT', 'O currículo ainda não está pronto para aprovação.');
    }
    const pending = pendingSuggestions(resume.content);
    if (pending > 0) {
      throw new AppError('CONFLICT', 'Confirme ou remova as sugestões antes de aprovar.', {
        pendingSuggestions: pending,
      });
    }
    const approved = await this.repo.approve(userId, id, this.clock.now());
    if (!approved) throw new AppError('CONFLICT', 'O currículo mudou. Revise e tente de novo.');
    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: 'resume.approved',
      entityType: 'resume',
      entityId: id,
    });
    return approved;
  }

  async delete(userId: string, id: string): Promise<void> {
    if (!(await this.repo.delete(userId, id))) throw notFound();
    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: 'resume.deleted',
      entityType: 'resume',
      entityId: id,
    });
  }
}
