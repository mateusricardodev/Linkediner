import type { AuditLog } from '../../audit';
import type { JobRepository } from '../../jobs';
import type { ResumeContent, ResumeRepository } from '../../resumes';
import { AppError, newId, systemClock, type Clock, type QuotaGate } from '../../shared';
import {
  assertTransition,
  buildDashboard,
  type Application,
  type ApplicationEvent,
  type ApplicationState,
  type Dashboard,
  type JobSummary,
  type ManualTask,
  type TransitionChange,
  type TransitionStep,
} from '../domain/application';
import { pendingInMaterials, type ApplicationMaterial } from '../domain/material';

/** Toda operação usa o contexto do usuário dono (RLS). */
export interface ApplicationRepository {
  /** Cria a candidatura e o primeiro evento. Devolve null se já existir uma para a vaga. */
  create(
    userId: string,
    application: { id: string; jobId: string; job: JobSummary; state: ApplicationState },
  ): Promise<Application | null>;
  findByJob(userId: string, jobId: string): Promise<Application | null>;
  find(userId: string, id: string): Promise<Application | null>;
  list(userId: string): Promise<Application[]>;
  events(userId: string, id: string): Promise<ApplicationEvent[]>;
  manualTasks(userId: string, id: string): Promise<ManualTask[]>;
  material(userId: string, id: string): Promise<ResumeContent | null>;
  /**
   * Aplica as transições e as mudanças numa transação, só se o estado ainda for `from`.
   * Devolve null se outra operação mudou o estado antes: nada é gravado.
   */
  transition(
    userId: string,
    id: string,
    from: ApplicationState,
    steps: TransitionStep[],
    change?: TransitionChange,
  ): Promise<Application | null>;
}

const notFound = () => new AppError('NOT_FOUND', 'Candidatura não encontrada.');

/**
 * Fluxo da candidatura. Nenhum caminho chega ao envio sem a aprovação da própria pessoa.
 * Sem fonte autorizada, a aprovação cria uma pendência para o envio manual: nada é enviado sozinho.
 */
export class ApplicationService {
  constructor(
    private readonly repo: ApplicationRepository,
    private readonly jobs: Pick<JobRepository, 'find'>,
    private readonly resumes: Pick<ResumeRepository, 'find'>,
    private readonly materials: {
      list(userId: string, applicationId: string): Promise<ApplicationMaterial[]>;
    },
    private readonly audit: AuditLog,
    private readonly quota: QuotaGate,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Salva a vaga como candidatura. Salvar de novo devolve a mesma. */
  async create(userId: string, jobId: string): Promise<Application> {
    const job = await this.jobs.find(userId, jobId);
    if (!job) throw new AppError('NOT_FOUND', 'Vaga não encontrada.');
    if (job.status !== 'ready') throw new AppError('CONFLICT', 'A vaga ainda não foi analisada.');

    const created = await this.repo.create(userId, {
      id: newId(),
      jobId,
      job: { title: job.title, company: job.company, applyUrl: job.applyUrl },
      state: 'saved',
    });
    if (created) {
      await this.record(userId, 'application.created', created.id);
      return created;
    }
    const existing = await this.repo.findByJob(userId, jobId);
    if (!existing) throw new AppError('INTERNAL', 'Não foi possível criar a candidatura.');
    return existing;
  }

  list(userId: string): Promise<Application[]> {
    return this.repo.list(userId);
  }

  async get(userId: string, id: string) {
    const application = await this.load(userId, id);
    const [events, manualTasks] = await Promise.all([
      this.repo.events(userId, id),
      this.repo.manualTasks(userId, id),
    ]);
    return { application, events, manualTasks };
  }

  async dashboard(userId: string): Promise<Dashboard> {
    return buildDashboard(await this.repo.list(userId));
  }

  /** Escolhe o currículo aprovado que vai na candidatura e leva à revisão. */
  async attachResume(userId: string, id: string, resumeId: string): Promise<Application> {
    const application = await this.load(userId, id);
    await this.approvedResume(userId, resumeId);
    if (application.state === 'in_review') {
      return this.apply(userId, application, [], { resumeId });
    }
    return this.apply(
      userId,
      application,
      [
        { to: 'analyzing', actor: 'user' },
        { to: 'in_review', actor: 'system', reason: 'material_ready' },
      ],
      { resumeId },
    );
  }

  async submitForApproval(userId: string, id: string): Promise<Application> {
    const application = await this.load(userId, id);
    await this.resumeForApproval(userId, application);
    return this.apply(userId, application, [{ to: 'awaiting_approval', actor: 'user' }]);
  }

  async requestChanges(userId: string, id: string): Promise<Application> {
    const application = await this.load(userId, id);
    return this.apply(userId, application, [{ to: 'in_review', actor: 'user' }]);
  }

  /**
   * A aprovação congela o material: o que vai para a candidatura é exatamente o que foi aprovado,
   * mesmo que o currículo seja editado depois. Sem integração autorizada, vira pendência manual.
   * O currículo adaptado à vaga, se houver, tem prioridade sobre o currículo geral escolhido.
   */
  async approve(userId: string, id: string): Promise<Application> {
    const application = await this.load(userId, id);
    const resume = await this.resumeForApproval(userId, application);
    // Antes de gastar o limite: aprovar no estado errado não pode consumir nada.
    assertTransition(application.state, 'approved', 'user');
    const usageKey = `approve:${id}:${newId()}`;
    await this.quota.consume(userId, 'applications.assisted', usageKey);
    let approved: Application;
    try {
      approved = await this.apply(
        userId,
        application,
        [
          { to: 'approved', actor: 'user' },
          { to: 'manual_action_required', actor: 'system', reason: 'no_integration' },
        ],
        {
          materialSnapshot: resume,
          submissionMode: 'assisted',
          createManualTask: { reason: 'no_integration' },
        },
      );
    } catch (error) {
      await this.quota.refund(userId, 'applications.assisted', usageKey);
      throw error;
    }
    await this.record(userId, 'application.approved', id);
    return approved;
  }

  /** A pessoa informa que enviou por conta própria. */
  async completeManually(userId: string, id: string): Promise<Application> {
    const application = await this.load(userId, id);
    const now = this.clock.now();
    const sent = await this.apply(
      userId,
      application,
      [{ to: 'sent', actor: 'user', reason: 'manual_submission' }],
      { submissionMode: 'manual', submittedAt: now, resolveManualTasks: { at: now } },
    );
    await this.record(userId, 'application.sent', id);
    return sent;
  }

  async reportOutcome(
    userId: string,
    id: string,
    outcome: 'interview_received' | 'rejected' | 'closed',
  ): Promise<Application> {
    const application = await this.load(userId, id);
    const updated = await this.apply(userId, application, [{ to: outcome, actor: 'user' }]);
    await this.record(userId, 'application.outcome', id, { outcome });
    return updated;
  }

  /** Desiste da candidatura, em qualquer estado que permita. */
  async close(userId: string, id: string): Promise<Application> {
    const application = await this.load(userId, id);
    const closed = await this.apply(
      userId,
      application,
      [{ to: 'closed', actor: 'user', reason: 'closed_by_user' }],
      { resolveManualTasks: { at: this.clock.now() } },
    );
    await this.record(userId, 'application.closed', id);
    return closed;
  }

  /** O currículo como foi aprovado nesta candidatura. */
  async approvedMaterial(userId: string, id: string): Promise<ResumeContent> {
    await this.load(userId, id);
    const material = await this.repo.material(userId, id);
    if (!material) throw new AppError('CONFLICT', 'Esta candidatura ainda não foi aprovada.');
    return material;
  }

  private async load(userId: string, id: string): Promise<Application> {
    const application = await this.repo.find(userId, id);
    if (!application) throw notFound();
    return application;
  }

  /** Nada segue para aprovação com geração em andamento ou frase sem a decisão da pessoa. */
  private async resumeForApproval(userId: string, application: Application) {
    const materials = await this.materials.list(userId, application.id);
    if (materials.some((m) => m.status === 'generating')) {
      throw new AppError('CONFLICT', 'Aguarde o fim da geração do material.');
    }
    const pending = pendingInMaterials(materials);
    if (pending > 0) {
      throw new AppError('CONFLICT', 'Confirme ou remova as sugestões do material.', {
        pendingSuggestions: pending,
      });
    }
    const tailored = materials.find((m) => m.kind === 'resume' && m.status === 'ready');
    if (tailored?.content) return tailored.content as ResumeContent;
    if (!application.resumeId) {
      throw new AppError('CONFLICT', 'Escolha um currículo aprovado ou gere um para esta vaga.');
    }
    return this.approvedResume(userId, application.resumeId);
  }

  private async approvedResume(userId: string, resumeId: string): Promise<ResumeContent> {
    const resume = await this.resumes.find(userId, resumeId);
    if (!resume) throw new AppError('NOT_FOUND', 'Currículo não encontrado.');
    if (resume.status !== 'approved' || !resume.content) {
      throw new AppError('CONFLICT', 'Aprove o currículo antes de usá-lo na candidatura.');
    }
    return resume.content;
  }

  private async apply(
    userId: string,
    application: Application,
    steps: TransitionStep[],
    change?: TransitionChange,
  ): Promise<Application> {
    let state = application.state;
    for (const step of steps) {
      assertTransition(state, step.to, step.actor);
      state = step.to;
    }
    const updated = await this.repo.transition(
      userId,
      application.id,
      application.state,
      steps,
      change,
    );
    if (!updated) throw new AppError('CONFLICT', 'A candidatura mudou. Atualize e tente de novo.');
    return updated;
  }

  private record(userId: string, action: string, id: string, metadata?: Record<string, unknown>) {
    return this.audit.record({
      actorType: 'user',
      actorId: userId,
      action,
      entityType: 'application',
      entityId: id,
      ...(metadata ? { metadata } : {}),
    });
  }
}
