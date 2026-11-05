# ADR 0008 — Retenção de 30 dias, exclusão completa e crypto-shredding

- **Status:** Proposto
- **Data:** 2026-11-05
- **Decisores:** time LinkedIner

## Contexto

Requisitos: documentos retidos por até 30 dias, exclusão imediata a pedido, política de exclusão para arquivos, derivados, cache, embeddings, logs e tarefas pendentes. Backups do banco guardam cópias de dados já apagados.

## Decisão

- Arquivos: regra de ciclo de vida de 30 dias no storage + job diário que apaga também o texto extraído e o cache derivado.
- Exclusão de conta: job `privacy.purge_user` com etapas ordenadas e relatório (ver [04 — F8](../arquitetura/04-fluxos.md)).
- **Crypto-shredding:**
  - cada usuário tem uma chave de dados (DEK), guardada cifrada por uma chave mestra em KMS;
  - texto extraído, saídas de IA e outros campos sensíveis são cifrados com essa DEK;
  - na exclusão, a DEK é destruída, e as cópias em backup ficam ilegíveis.
- Logs sem PII. Auditoria mantida e pseudonimizada.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Apagar só os dados ativos e esperar os backups expirarem | Dados continuam legíveis nos backups durante a janela de retenção |
| Restaurar backups e apagar registro a registro | Inviável operacionalmente |

## Consequências

- Positivas: exclusão verificável inclusive em backups; reduz o impacto de um eventual vazamento.
- Negativas: busca textual sobre campos cifrados não é possível (não é necessária nesses campos); depende de KMS. A implementação completa pode vir na Fase 4, mas o esquema já nasce preparado.
