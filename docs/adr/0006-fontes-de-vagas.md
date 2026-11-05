# ADR 0006 — Fontes de vagas por adaptadores independentes, sem scraping

- **Status:** Proposto
- **Data:** 2026-11-05
- **Decisores:** time LinkedIner

## Contexto

O produto deve trabalhar com LinkedIn, Indeed, Wellfound, Greenhouse, Lever e sites de empresas, sem scraping nem automação não autorizada, e sem depender só do LinkedIn. Os termos do LinkedIn proíbem scraping e bots.

## Decisão

- Porta `JobSourceAdapter`, com capacidades declaradas (`list_jobs`, `fetch_job`, `apply_api`, `assisted_apply`).
- O domínio decide pelo que a fonte declara, não pelo nome da fonte.
- **Importação manual** (texto ou link colado pelo usuário) disponível desde o MVP, para qualquer fonte, inclusive LinkedIn e Indeed.
- Greenhouse e Lever: listagem pelas APIs públicas por empresa. Candidatura por API só com a chave de uma empresa parceira.
- Fontes ligadas e desligadas por dados (`job_sources.status`), com data de revisão dos termos.
- Disjuntor por fonte, com fallback automático para candidatura assistida.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Scraping do LinkedIn ou de outros sites | Proibido pelos termos, juridicamente arriscado e frágil |
| Agregadores de vagas de terceiros sem licença clara | Origem dos dados incerta |

## Consequências

- Positivas: substituir ou desligar uma fonte não afeta o domínio; conformidade com os termos.
- Negativas: no MVP, quase todas as candidaturas serão assistidas. A automação depende de parcerias (risco R1).
