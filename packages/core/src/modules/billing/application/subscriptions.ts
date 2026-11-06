import type { AuditLog } from '../../audit';
import { AppError } from '../../shared';
import {
  grantsPlan,
  type PaidPlan,
  type Subscription,
  type SubscriptionEvent,
} from '../domain/plan';

/** Provedor de pagamento (Stripe primeiro). Nenhum dado de cartão passa pela aplicação. */
export interface PaymentProvider {
  readonly id: string;
  createCheckout(input: {
    userId: string;
    email: string;
    plan: PaidPlan;
    customerId: string | null;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string>;
  createPortal(customerId: string, returnUrl: string): Promise<string>;
  /** Confere a assinatura do webhook. Devolve null para eventos que não interessam. */
  parseWebhook(rawBody: Buffer, signature: string): SubscriptionEvent | null;
  /** Apaga o cliente no provedor, o que cancela a assinatura. Já apagado não é erro. */
  deleteCustomer(customerId: string): Promise<void>;
}

export interface SubscriptionRepository {
  /** Usa o papel dono do banco: o webhook não tem usuário autenticado. */
  emailOf(userId: string): Promise<string | null>;
  find(userId: string): Promise<Subscription | null>;
  /**
   * Numa transação: marca o evento como processado e atualiza a assinatura. Evento repetido, mais
   * antigo, de outra assinatura já substituída ou de usuário que não existe mais não muda nada.
   */
  applyEvent(event: SubscriptionEvent, provider: string): Promise<boolean>;
}

const unavailable = () =>
  new AppError('DEPENDENCY_UNAVAILABLE', 'Os pagamentos não estão disponíveis no momento.');

export class SubscriptionService {
  constructor(
    private readonly repo: SubscriptionRepository,
    private readonly provider: PaymentProvider | null,
    private readonly audit: AuditLog,
    private readonly urls: { web: string },
  ) {}

  async checkout(userId: string, plan: PaidPlan): Promise<string> {
    if (!this.provider) throw unavailable();
    const [current, email] = await Promise.all([this.repo.find(userId), this.repo.emailOf(userId)]);
    if (!email) throw new AppError('NOT_FOUND', 'Conta não encontrada.');
    if (current && grantsPlan(current.status)) {
      throw new AppError('CONFLICT', 'Você já tem uma assinatura. Altere o plano pelo portal.');
    }
    return this.provider.createCheckout({
      userId,
      email,
      plan,
      customerId: current?.providerCustomerId ?? null,
      successUrl: `${this.urls.web}/assinatura?status=sucesso`,
      cancelUrl: `${this.urls.web}/assinatura?status=cancelado`,
    });
  }

  async portal(userId: string): Promise<string> {
    if (!this.provider) throw unavailable();
    const current = await this.repo.find(userId);
    if (!current) throw new AppError('NOT_FOUND', 'Você não tem uma assinatura.');
    return this.provider.createPortal(current.providerCustomerId, `${this.urls.web}/assinatura`);
  }

  /** Só o webhook muda a assinatura: voltar da tela de pagamento não libera nada. */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    if (!this.provider) throw unavailable();
    let event: SubscriptionEvent | null;
    try {
      event = this.provider.parseWebhook(rawBody, signature);
    } catch (cause) {
      throw new AppError('VALIDATION_FAILED', 'Assinatura do webhook inválida.', undefined, {
        cause,
      });
    }
    if (!event) return;
    const applied = await this.repo.applyEvent(event, this.provider.id);
    if (!applied) return;
    await this.audit.record({
      actorType: 'system',
      actorId: event.userId,
      action: 'subscription.changed',
      entityType: 'subscription',
      entityId: event.providerSubscriptionId,
      metadata: { plan: event.planKey, status: event.status },
    });
  }

  /** Na exclusão da conta. Sem provedor configurado, o pedido fica aberto até poder cancelar. */
  async cancelForUser(userId: string): Promise<number> {
    const current = await this.repo.find(userId);
    if (!current) return 0;
    if (!this.provider) throw unavailable();
    await this.provider.deleteCustomer(current.providerCustomerId);
    return 1;
  }
}
