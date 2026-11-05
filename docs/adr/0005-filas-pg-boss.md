# ADR 0005 — Filas e tarefas assíncronas com pg-boss no Postgres

- **Status:** Proposto
- **Data:** 2026-11-05
- **Decisores:** time LinkedIner

## Contexto

Extração de PDF, chamadas de IA, matching, envio de candidaturas e expurgo de dados são tarefas demoradas ou que podem falhar e precisam de nova tentativa.

## Decisão

- pg-boss, usando o mesmo Postgres: repetição com backoff, agendamento (cron), fila de falhas, concorrência por fila.
- Enfileiramento na mesma transação da mudança de dados, quando aplicável.
- Handlers idempotentes. O payload leva IDs, nunca dados pessoais.
- Outbox para eventos de domínio, publicada por um handler dedicado.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| BullMQ + Redis | Mais uma peça de infraestrutura para operar e incluir na exclusão LGPD, sem necessidade no volume do MVP |
| SQS / Cloud Tasks | Prende o projeto a um provedor. Não permite transação junto com os dados. |

## Consequências

- Positivas: zero infraestrutura extra, consistência transacional, simples de testar localmente.
- Negativas: limite de throughput menor que Redis. Gatilho de migração documentado em [08](../arquitetura/08-operacao.md).
