import type { AuditLog } from '../../audit';
import type { JobRepository } from '../../jobs';
import type { ConsentService } from '../../privacy';
import type { FactRepository } from '../../profile';
import { AppError, newId, type QuotaGate } from '../../shared';
import { assertTransition } from '../domain/application';
import {
  MATERIAL_FAILURES,
  MATERIAL_FEATURES,
  materialItems,
  materialUsageKey,
  validateQuestions,
  type ApplicationMaterial,
  type GenerateMaterialJob,
  type MaterialContent,
  type MaterialKind,
} from '../domain/material';
import type { ApplicationRepository } from './application-service';

/** Toda operação usa o contexto do usuário dono (RLS). */
export interface MaterialRepository {
  /** Cria o material do tipo ou reinicia o existente: gerar de novo substitui. */
  upsertGenerating(
    userId: string,
    material: { id: string; applicationId: string; kind: MaterialKind; questions: string[] },
  ): Promise<ApplicationMaterial>;
  find(userId: string, id: string): Promise<ApplicationMaterial | null>;
  list(userId: string, applicationId: string): Promise<ApplicationMaterial[]>;
  saveReady(userId: string, id: string, content: MaterialContent): Promise<void>;
  markFailed(userId: string, id: string, failureCode: string): Promise<void>;
  /** Altera o conteúdo numa transação com bloqueio, para duas edições não se sobrescreverem. */
  updateContent(
    userId: string,
    id: string,
    change: (content: MaterialContent) => void,
  ): Promise<ApplicationMaterial | null>;
  delete(userId: string, id: string): Promise<boolean>;
}

export interface MaterialQueue {
  enqueue(job: GenerateMaterialJob): Promise<void>;
}

export type MaterialDecision = { action: 'confirm'; text?: string } | { action: 'remove' };

const notFound = () => new AppError('NOT_FOUND', 'Material não encontrado.');

/** Material gerado para a vaga: currículo adaptado, carta e respostas de formulário. */
export class MaterialService {
  constructor(
    private readonly materials: MaterialRepository,
    private readonly applications: Pick<ApplicationRepository, 'find' | 'transition'>,
    private readonly jobs: Pick<JobRepository, 'find'>,
    private readonly facts: Pick<FactRepository, 'list' | 'addConfirmed'>,
    private readonly consents: Pick<ConsentService, 'status'>,
    private readonly queue: MaterialQueue,
    private readonly audit: AuditLog,
    private readonly quota: QuotaGate,
  ) {}

  async request(
    userId: string,
    applicationId: string,
    input: { kind: MaterialKind; questions?: readonly string[] | undefined },
  ): Promise<ApplicationMaterial> {
    const questions = validateQuestions(input.kind, input.questions ?? []);
    const application = await this.application(userId, applicationId);

    const { granted } = await this.consents.status(userId);
    if (!granted.ai_processing) {
      throw new AppError(
        'CONSENT_REQUIRED',
        'Autorize o processamento por IA para gerar o material.',
        { missing: ['ai_processing'] },
      );
    }
    const job = application.jobId ? await this.jobs.find(userId, application.jobId) : null;
    if (!job) throw new AppError('CONFLICT', 'A vaga desta candidatura foi apagada.');
    const facts = await this.facts.list(userId);
    if (!facts.some((f) => f.verification === 'extracted' || f.verification === 'user_confirmed')) {
      throw new AppError('CONFLICT', 'Envie um currículo antes de gerar o material.');
    }

    const { state } = application;
    // Pedir de novo enquanto gera devolve o mesmo pedido, sem gastar outra chamada de IA.
    const current = await this.materials.list(userId, applicationId);
    const generating = current.find((m) => m.kind === input.kind && m.status === 'generating');
    if (generating) return generating;

    // Em revisão ou já gerando outro material, a candidatura fica onde está.
    const moves = state !== 'in_review' && state !== 'analyzing';
    // Antes de gastar o limite: a candidatura aprovada não aceita material novo.
    if (moves) assertTransition(state, 'analyzing', 'user');

    const feature = MATERIAL_FEATURES[input.kind];
    const usageId = newId();
    const usageKey = materialUsageKey(usageId);
    await this.quota.consume(userId, feature, usageKey);
    if (moves) {
      const moved = await this.applications.transition(userId, applicationId, state, [
        { to: 'analyzing', actor: 'user' },
      ]);
      if (!moved) {
        await this.quota.refund(userId, feature, usageKey);
        throw new AppError('CONFLICT', 'A candidatura mudou. Atualize e tente de novo.');
      }
    }

    const material = await this.materials.upsertGenerating(userId, {
      id: newId(),
      applicationId,
      kind: input.kind,
      questions,
    });
    try {
      await this.queue.enqueue({ userId, applicationId, materialId: material.id, usageId });
    } catch {
      await this.materials.markFailed(userId, material.id, MATERIAL_FAILURES.processingError);
      await this.applications.transition(userId, applicationId, 'analyzing', [
        { to: 'in_review', actor: 'system', reason: 'material_failed' },
      ]);
      await this.quota.refund(userId, feature, usageKey);
      throw new AppError(
        'DEPENDENCY_UNAVAILABLE',
        'Não foi possível iniciar a geração. Tente de novo.',
      );
    }
    return material;
  }

  async list(userId: string, applicationId: string): Promise<ApplicationMaterial[]> {
    await this.application(userId, applicationId);
    return this.materials.list(userId, applicationId);
  }

  /**
   * A pessoa confirma, corrige ou remove cada frase. Só com a candidatura em revisão: depois de
   * aprovada, o material fica congelado. Sugestão confirmada no currículo também vira fato dela.
   */
  async decideItem(
    userId: string,
    applicationId: string,
    materialId: string,
    itemId: string,
    decision: MaterialDecision,
  ): Promise<ApplicationMaterial> {
    await this.assertEditable(userId, applicationId);
    const current = await this.owned(userId, applicationId, materialId);

    let found = false;
    let newFact: string | undefined;
    const updated = await this.materials.updateContent(userId, materialId, (content) => {
      const item = materialItems(current.kind, content).find((i) => i.id === itemId);
      if (!item) return;
      found = true;
      if (decision.action === 'remove') {
        item.status = 'removed';
        return;
      }
      if (decision.text !== undefined) item.text = decision.text;
      if (item.status === 'suggested' || decision.text !== undefined) newFact = item.text;
      item.status = 'user_confirmed';
      item.reason = null;
    });
    if (!updated) throw notFound();
    if (!found) throw new AppError('NOT_FOUND', 'Frase não encontrada neste material.');

    if (newFact && current.kind === 'resume') {
      await this.facts.addConfirmed(userId, {
        type: 'achievement',
        data: { description: newFact },
      });
    }
    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: decision.action === 'remove' ? 'material.item_removed' : 'material.item_confirmed',
      entityType: 'application_material',
      entityId: materialId,
      metadata: { kind: current.kind },
    });
    return updated;
  }

  async delete(userId: string, applicationId: string, materialId: string): Promise<void> {
    await this.assertEditable(userId, applicationId);
    await this.owned(userId, applicationId, materialId);
    await this.materials.delete(userId, materialId);
  }

  private async application(userId: string, id: string) {
    const application = await this.applications.find(userId, id);
    if (!application) throw new AppError('NOT_FOUND', 'Candidatura não encontrada.');
    return application;
  }

  private async assertEditable(userId: string, applicationId: string) {
    const { state } = await this.application(userId, applicationId);
    if (state !== 'in_review') {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'O material só pode ser alterado em revisão.',
        {
          from: state,
        },
      );
    }
  }

  private async owned(userId: string, applicationId: string, materialId: string) {
    const material = await this.materials.find(userId, materialId);
    if (!material || material.applicationId !== applicationId) throw notFound();
    return material;
  }
}
