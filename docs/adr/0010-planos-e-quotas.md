# ADR 0010 — Planos por entitlements e ledger de consumo

- **Status:** Proposto
- **Data:** 2026-11-05
- **Decisores:** time LinkedIner

## Contexto

Os planos Gratuito, Pro e Avançado têm limites diferentes, e preços e limites vão mudar. O domínio não deve ser reescrito a cada mudança comercial.

## Decisão

- `plans` e `plan_entitlements` como dados: `feature_key`, limite e período.
- `usage_records` como ledger somente de inserção, com chave de idempotência.
- API do módulo: `entitlements.check(actor, feature)` e `usage.consume(...)`. Proibido `if (plan === 'pro')` no código.
- Verificação e consumo na mesma transação da mudança de estado.
- Reserva e confirmação para tarefas assíncronas.
- Preço fica no provedor de pagamento (`PaymentProvider`; primeiro, Stripe), sincronizado por webhook.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Limites fixos no código por plano | Cada mudança comercial vira deploy e espalha condicionais pelo código |
| Contador mutável por usuário | Perde histórico. Sujeito a condições de corrida e a consumo duplicado. |

## Consequências

- Positivas: novos planos, promoções e grandfathering sem mudar o domínio; histórico de consumo auditável.
- Negativas: consultas de saldo somam o ledger. Pode exigir uma tabela de agregados se o volume crescer.
