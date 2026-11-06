import type { AuditLog } from '../../audit';
import { userPrefix, type ObjectStorage } from '../../documents';
import { AppError, newId, systemClock, type Clock } from '../../shared';
import {
  assertRecentLogin,
  PURGE_RESUME_AFTER_MS,
  type DeletionRequest,
  type PurgeUserJob,
} from '../domain/account-data';

export interface AccountDeletionRepository {
  emailOf(userId: string): Promise<string | null>;
  /**
   * Numa transação: marca a conta como `pending_deletion`, encerra as sessões e abre o pedido.
   * Pedir de novo devolve o pedido já aberto.
   */
  begin(userId: string, request: { id: string; userRef: string }): Promise<DeletionRequest>;
  find(id: string): Promise<DeletionRequest | null>;
  /**
   * Numa transação: pseudonimiza a auditoria, apaga o usuário (o banco apaga o resto em cascata)
   * e conclui o pedido com o relatório. Não existe estado intermediário a retomar.
   */
  complete(request: DeletionRequest, report: Record<string, number>): Promise<void>;
  markFailed(id: string): Promise<void>;
  /** Pedidos não concluídos, feitos antes da data. */
  listOpen(before: Date): Promise<DeletionRequest[]>;
}

export interface PurgeQueue {
  enqueue(job: PurgeUserJob): Promise<void>;
}

/** Tarefas ainda na fila de um usuário. O payload delas tem só IDs. */
export interface PendingTasks {
  cancelForUser(userId: string): Promise<number>;
}

/** Pedido de exclusão, na API. O expurgo em si roda no worker. */
export class AccountDeletionService {
  constructor(
    private readonly repo: Pick<AccountDeletionRepository, 'emailOf' | 'begin'>,
    private readonly queue: PurgeQueue,
    private readonly audit: AuditLog,
    private readonly pseudonymize: (id: string) => string,
    private readonly clock: Clock = systemClock,
  ) {}

  async request(
    userId: string,
    input: { confirmEmail: string; sessionCreatedAt: Date },
  ): Promise<DeletionRequest> {
    assertRecentLogin(input.sessionCreatedAt, this.clock.now());
    const email = await this.repo.emailOf(userId);
    if (!email || email.toLowerCase() !== input.confirmEmail.trim().toLowerCase()) {
      throw new AppError('VALIDATION_FAILED', 'O e-mail informado não confere.', {
        field: 'confirmEmail',
      });
    }
    const request = await this.repo.begin(userId, {
      id: newId(),
      userRef: this.pseudonymize(userId),
    });
    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: 'account.deletion_requested',
      entityType: 'deletion_request',
      entityId: request.id,
    });
    try {
      await this.queue.enqueue({ requestId: request.id });
    } catch {
      // O pedido já está gravado e a conta, bloqueada: a tarefa periódica retoma o expurgo.
    }
    return request;
  }
}

export interface PurgeUserDeps {
  repo: Pick<AccountDeletionRepository, 'find' | 'complete' | 'markFailed' | 'listOpen'>;
  storage: Pick<ObjectStorage, 'deletePrefix'>;
  tasks: PendingTasks;
  keys: { destroy(userId: string): Promise<void> };
  clock?: Clock;
}

export type PurgeOutcome = 'completed' | 'skipped';

/**
 * Expurgo da conta (F8). Cada etapa pode ser repetida sem efeito colateral. Os arquivos saem antes
 * do banco: se algo falhar no meio, a nova tentativa ainda sabe de qual usuário se trata.
 */
export class PurgeUser {
  private readonly clock: Clock;

  constructor(private readonly deps: PurgeUserDeps) {
    this.clock = deps.clock ?? systemClock;
  }

  async run(job: PurgeUserJob, opts: { isLastAttempt: boolean }): Promise<PurgeOutcome> {
    const request = await this.deps.repo.find(job.requestId);
    if (!request || request.status === 'completed') return 'skipped';
    try {
      const report: Record<string, number> = { cancelledTasks: 0, deletedFiles: 0 };
      if (request.userId) {
        report.cancelledTasks = await this.deps.tasks.cancelForUser(request.userId);
        report.deletedFiles = await this.deps.storage.deletePrefix(userPrefix(request.userId));
        // Antes de concluir o pedido: depois disso não se sabe mais de quem era a chave.
        await this.deps.keys.destroy(request.userId);
      }
      await this.deps.repo.complete(request, report);
      return 'completed';
    } catch (error) {
      if (opts.isLastAttempt) await this.deps.repo.markFailed(request.id);
      throw error;
    }
  }

  /** Retoma pedidos parados ou que falharam. A exclusão não pode depender de a fila não perder nada. */
  async resumeOpen(): Promise<{ resumed: number; failed: number }> {
    const before = new Date(this.clock.now().getTime() - PURGE_RESUME_AFTER_MS);
    const open = await this.deps.repo.listOpen(before);
    let failed = 0;
    for (const request of open) {
      try {
        await this.run({ requestId: request.id }, { isLastAttempt: true });
      } catch {
        failed++;
      }
    }
    return { resumed: open.length - failed, failed };
  }
}
