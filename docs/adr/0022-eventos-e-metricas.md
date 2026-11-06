# ADR 0022 — Eventos de produto e métricas em SQL

- **Status:** Proposto
- **Data:** 2026-11-06
- **Decisores:** time LinkedIner

## Contexto

O produto precisa medir o funil e a taxa de entrevistas sem expor dados pessoais. Espalhar chamadas de métrica por cada caso de uso misturaria responsabilidades, e uma falha nas métricas não pode derrubar um fluxo.

## Decisão

- **Os eventos nascem da auditoria.** Um decorador da `AuditLog` traduz as ações importantes em eventos, e nenhum caso de uso sabe de métricas. `job_viewed` e `job_recommended` não são auditados, então vêm das rotas.
- **Só uma lista fechada de propriedades passa**: `kind`, `source`, `reasons` e `outcome`. Um campo novo na auditoria não vira propriedade sem alterar essa lista.
- **Uma falha nas métricas nunca derruba o fluxo:** ela só vai para o log. A falha da auditoria continua subindo.
- **O usuário é um pseudônimo**, igual ao da auditoria, e a tabela não tem acesso do papel da aplicação.
- **Excluir a conta troca o pseudônimo por um valor aleatório.** Os totais continuam valendo, sem ligação com a pessoa.
- **A exportação de dados inclui os eventos da própria pessoa.**
- **Retenção de 13 meses** (395 dias), o suficiente para comparar um mês com o mesmo mês do ano anterior.
- **Ver ou receber a mesma vaga conta uma vez por pessoa**, para o funil medir vagas, e não recarregamentos.

### Views

Só o papel dono do banco lê as views. Elas agregam todos os usuários, e ainda não há painel.

| View | O que mede |
|---|---|
| `metric_interview_rate` | Métrica principal: entrevistas ÷ enviadas com compatibilidade ≥ 70, em 60 dias |
| `metric_funnel_monthly` | Recomendação → visualização → candidatura → aprovação → envio → entrevista, avaliações negativas e as taxas de aprovação, conclusão e rejeição |
| `metric_applications_sent_monthly` | Enviadas por mês e por modo |
| `metric_time_saved_monthly` | Estimativa: currículo = 30 min, carta = 20 min, formulário = 10 min |
| `metric_score_evolution` | Diferença média entre o primeiro e o último score de cada pessoa |
| `metric_events_monthly` | Total de cada evento e de pessoas por mês |

## Consequências

- `metric_interview_rate` e `metric_score_evolution` leem as tabelas do produto, porque precisam da compatibilidade e do histórico do score. Contas excluídas saem dessas duas, mas seguem nas views baseadas em eventos.
- As taxas são nulas quando não há base para calcular, e não zero.

## Limitações conhecidas

- **Base legal:** os eventos usam dados pseudonimizados, sem um consentimento próprio. Isso precisa de validação jurídica antes do beta ([00 — B3](../arquitetura/00-descoberta.md)).
- **A compatibilidade é a última calculada**, não a do momento do envio. Candidatura sem compatibilidade calculada fica fora da métrica principal.
- **As taxas do funil comparam totais do mesmo mês**, sem seguir cada vaga. Uma recomendação em um mês e o envio no outro caem em meses diferentes.
- **Eventos que ainda não são gerados:** `profile_scored` (a evolução do score lê a tabela `profile_scores`), `application_failed` e `application_blocked` (não existe envio automático).
- **Sem taxa de falhas de automação**, pelo mesmo motivo.
- **O lembrete de 14 dias para informar o resultado** não existe. Sem ele, a métrica principal depende de a pessoa informar por conta própria.
