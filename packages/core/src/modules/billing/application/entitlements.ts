import {
  AppError,
  newId,
  systemClock,
  type Clock,
  type FeatureKey,
  type QuotaGate,
} from '../../shared';
import {
  currentPeriod,
  describeUsage,
  type Entitlement,
  type FeatureUsage,
  type PlanWithEntitlements,
} from '../domain/plan';

/** Toda operação usa o contexto do usuário dono (RLS). */
export interface UsageRepository {
  /** O plano em vigor: o da assinatura válida ou, sem ela, o gratuito. */
  planOf(userId: string): Promise<PlanWithEntitlements>;
  usedInPeriod(userId: string, periodKey: string): Promise<Map<string, number>>;
  /**
   * Numa transação, com bloqueio por usuário e funcionalidade: confere o saldo e registra o consumo.
   * Chave já registrada: não consome de novo e devolve `allowed`.
   */
  consume(
    userId: string,
    entry: { id: string; feature: FeatureKey; periodKey: string; limit: number; key: string },
  ): Promise<{ allowed: boolean; used: number }>;
  /** Registra o estorno no período do consumo original. Sem consumo, ou já estornado, nada muda. */
  refund(userId: string, entry: { id: string; feature: FeatureKey; key: string }): Promise<void>;
}

/** Responde "este usuário pode usar esta funcionalidade agora?", e nunca "qual é o plano?". */
export class EntitlementService implements QuotaGate {
  constructor(
    private readonly repo: UsageRepository,
    private readonly clock: Clock = systemClock,
  ) {}

  async consume(userId: string, feature: FeatureKey, key: string): Promise<void> {
    const entitlement = await this.entitlement(userId, feature);
    const period = currentPeriod(this.clock);
    const { allowed, used } = await this.repo.consume(userId, {
      id: newId(),
      feature,
      periodKey: period.key,
      limit: entitlement.limit,
      key,
    });
    if (!allowed) {
      throw new AppError('QUOTA_EXCEEDED', 'O limite do seu plano para este recurso acabou.', {
        feature,
        limit: entitlement.limit,
        used,
        resetsAt: period.resetsAt.toISOString(),
      });
    }
  }

  refund(userId: string, feature: FeatureKey, key: string): Promise<void> {
    return this.repo.refund(userId, { id: newId(), feature, key });
  }

  /** Valor de uma funcionalidade sim/não. */
  async enabled(userId: string, feature: FeatureKey): Promise<boolean> {
    return (await this.entitlement(userId, feature)).limit > 0;
  }

  async summary(
    userId: string,
  ): Promise<{ plan: { key: string; name: string }; features: FeatureUsage[] }> {
    const period = currentPeriod(this.clock);
    const [plan, used] = await Promise.all([
      this.repo.planOf(userId),
      this.repo.usedInPeriod(userId, period.key),
    ]);
    return {
      plan: { key: plan.key, name: plan.name },
      features: describeUsage(plan.entitlements, used, period.resetsAt),
    };
  }

  private async entitlement(userId: string, feature: FeatureKey): Promise<Entitlement> {
    const plan = await this.repo.planOf(userId);
    // Sem linha para a funcionalidade, ela não está no plano: nunca libera por engano.
    return (
      plan.entitlements.find((e) => e.featureKey === feature) ?? {
        featureKey: feature,
        limit: 0,
        period: null,
      }
    );
  }
}
