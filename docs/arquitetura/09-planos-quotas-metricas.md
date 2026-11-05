# 09 — Planos, quotas e métricas

## 13. Planos e quotas ([ADR 0010](../adr/0010-planos-e-quotas.md))

O domínio nunca pergunta "qual é o plano?". Ele pergunta **"este usuário pode usar esta funcionalidade agora?"**. Planos são dados (`plans` + `plan_entitlements`), e o consumo é um ledger somente de inserção (`usage_records`). Mudar preço ou limite é alterar dados, não código.

### Funcionalidades controladas (feature keys)

| Feature key | Tipo | Gratuito | Pro | Avançado |
|---|---|---|---|---|
| `profile.analysis` | contador/mês | 3 | 20 | 60 |
| `resume.improved` | contador/mês | 1 | ilimitado* | ilimitado* |
| `resume.tailored` | contador/mês | 0 | 30 | 100 |
| `cover_letter` | contador/mês | 0 | 30 | 100 |
| `job.match` | contador/mês | 10 | 300 | 1000 |
| `applications.assisted` | contador/mês | 3 | 60 | 200 |
| `applications.auto` | contador/mês | 0 | 30 | 100 |
| `export.watermark` | booleano | sim | não | não |
| `dashboard.full` | booleano | não | sim | sim |
| `sources.extra` | booleano | não | não | sim |
| `apply_rules.advanced` | booleano | não | não | sim |
| `monitoring.frequency_hours` | valor | — | 24 | 6 |
| `github.deep_analysis` | booleano | não | não | sim |
| `interview.simulation` | contador/mês | 0 | 0 | 10 |

\* "Ilimitado" na prática tem um teto alto de uso justo, para proteger o custo de IA.

Os números são ponto de partida para validação comercial, não decisão final.

### Como funciona

```ts
// modules/billing/application
const decision = await entitlements.check(actor, 'applications.auto'); // { allowed, remaining, resetsAt }
await usage.consume(actor, 'applications.auto', 1, { idempotencyKey: `apply:${applicationId}` });
```

- **Verificação e consumo atômicos:** feitos na mesma transação da mudança de estado, com bloqueio por usuário e feature para evitar corrida.
- **Idempotência:** repetir a mesma operação não consome duas vezes.
- **Reserva para tarefas assíncronas:** a geração de material reserva a quota na API e confirma no worker. Se falhar, a reserva é estornada.
- **Mudança de plano:** o webhook do provedor de pagamento atualiza `subscriptions`. Os limites passam a valer na hora, e o consumo do período é mantido.
- **Grandfathering:** `plans.version` permite manter assinantes antigos em condições anteriores.

## Métricas do produto

Os eventos são gravados em `product_events`, sem PII, com o usuário pseudonimizado.

### Eventos

`user_signed_up`, `resume_uploaded`, `profile_scored`, `resume_generated`, `material_approved`, `job_imported`, `job_recommended`, `job_viewed`, `job_feedback_given`, `application_created`, `application_approved`, `application_rejected_by_user`, `application_sent`, `application_failed`, `application_blocked`, `manual_task_completed`, `interview_reported`, `application_outcome_reported`.

### Métrica principal

**Taxa de entrevistas geradas por candidaturas relevantes:**

```
entrevistas informadas ÷ candidaturas enviadas com compatibilidade ≥ 70 (janela de 60 dias)
```

Depende de o usuário informar o resultado. Por isso a interface pergunta de forma leve: lembrete 14 dias após o envio, com um toque para responder.

### Métricas secundárias

| Métrica | Definição |
|---|---|
| Tempo economizado | Estimativa por tarefa (ex.: currículo personalizado = 30 min, carta = 20 min, formulário = 10 min) × tarefas concluídas. Exibida como estimativa. |
| Taxa de aprovação das recomendações | Vagas que viraram candidatura aprovada ÷ vagas recomendadas e visualizadas |
| Taxa de candidaturas concluídas | Enviadas ÷ criadas |
| Candidaturas enviadas | Contagem por período, por modo (`api`, `assisted`, `manual`) |
| Taxa de falhas de automação | (`failed` + `blocked_by_source`) ÷ tentativas por API, por fonte |
| Taxa de vagas rejeitadas pelo usuário | Feedback negativo ou descarte ÷ recomendadas |
| Evolução do score do perfil | Diferença entre o primeiro e o último `profile_scores` por usuário |
| Funil | recomendação → visualização → candidatura aprovada → enviada → entrevista |

As métricas são calculadas com views SQL no MVP. Um painel interno vem depois. A comunicação do produto nunca promete "contratação garantida".
