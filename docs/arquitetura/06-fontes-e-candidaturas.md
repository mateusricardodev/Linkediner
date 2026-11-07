# 06 — Fontes de vagas e candidaturas

## Princípio

Cada fonte é um **adaptador independente** que declara o que pode fazer. O domínio pergunta pelas capacidades, e não pelo nome da fonte. Se uma fonte mudar as regras, basta desligar ou trocar o adaptador ([ADR 0006](../adr/0006-fontes-de-vagas.md)).

```ts
// packages/core/src/modules/jobs/application/ports/job-source-adapter.ts
export type SourceCapability =
  | 'list_jobs'          // listar vagas por API ou feed permitido
  | 'fetch_job'          // obter uma vaga específica
  | 'apply_api'          // enviar candidatura por API oficial autorizada
  | 'assisted_apply';    // gerar pacote para o usuário enviar manualmente

export interface JobSourceAdapter {
  readonly key: string;
  readonly capabilities: ReadonlySet<SourceCapability>;
  listJobs?(q: JobQuery): AsyncIterable<ExternalJob>;
  fetchJob?(ref: ExternalJobRef): Promise<ExternalJob>;
  submitApplication?(req: SubmitRequest): Promise<SubmitResult>; // sent | failed | blocked
  buildAssistedPackage(req: SubmitRequest): Promise<AssistedPackage>;
}
```

## Matriz das fontes

Situação conhecida na data deste documento. Os termos de cada fonte devem ser revisados antes de ativar o adaptador, e a data da revisão fica registrada em `job_sources.terms_reviewed_at`.

| Fonte | Listar vagas | Candidatura automática | Estratégia inicial |
|---|---|---|---|
| **Importação manual** | Usuário cola o texto ou o link | Não | **Disponível desde o MVP.** Funciona para qualquer fonte, inclusive LinkedIn e Indeed. |
| **Greenhouse** | Job Board API pública, por empresa (`boards-api.greenhouse.io`) | A API de candidatura exige a chave da empresa contratante | Listar: pronto, desligado por padrão ([ADR 0024](../adr/0024-vagas-automaticas.md)). Candidatura automática: só com empresa parceira que forneça a chave. |
| **Lever** | Postings API pública, por empresa (`api.lever.co`) | O envio por API exige a chave da empresa | Igual ao Greenhouse |
| **LinkedIn** | Sem API para este uso. Scraping e automação são proibidos pelos termos. | Proibida | Apenas importação manual feita pelo usuário. O LinkedIn também entra como provedor de login (OIDC). |
| **Indeed** | Acesso a APIs só por programas de parceria | Não | Importação manual. Avaliar programa de parceria no futuro. |
| **Wellfound** | Sem API pública conhecida | Não | Importação manual |
| **Sites de empresas** | Página de carreiras informada pelo usuário. Leitura de dados estruturados `JobPosting` (schema.org) quando presentes, respeitando robots.txt e os termos do site. | Não | Avaliação jurídica antes de ativar. Até lá, importação manual. |
| **Outras fontes autorizadas** | Novo adaptador | Conforme o acordo | Parcerias e feeds licenciados |

> **Implicação honesta para o produto:** no MVP, praticamente todas as candidaturas serão **assistidas**. A automação real depende de parcerias com empresas ou de fontes com API oficial de candidatura. Por isso, a automação fica fora do MVP e entra só quando houver uma fonte autorizada e testável ([00 — Dúvida B2](00-descoberta.md)).

## Candidatura assistida

Quando não há `apply_api`, o sistema cria uma `manual_task` com:
- link direto para a página de candidatura da vaga;
- currículo e carta aprovados, prontos para baixar;
- respostas aprovadas para as perguntas comuns, com botão de copiar;
- checklist de campos. Quando o usuário marca "Enviei", a candidatura vai para `sent` com `submission_mode = manual`.

Uma extensão de navegador para preencher formulários foi considerada e **adiada**: ela poderia ser usada em sites que proíbem automação, e exigiria controles de domínio cuidadosos. Ver [11 — Decisões adiadas](11-riscos-backlog-roadmap.md).

## Proteções na automação (quando houver fonte autorizada)

- Envio apenas com aprovação registrada (ver [04 — F6](04-fluxos.md)).
- Limite de envios por usuário e por fonte, além do limite do plano.
- Repetição com backoff exponencial só para erros técnicos. Recusa da fonte vira `blocked_by_source`, sem nova tentativa automática.
- Disjuntor por fonte: se a taxa de falhas passar de um limiar, a fonte é pausada e as candidaturas vão para o fluxo assistido.
- Credenciais de parceiros guardadas em um gerenciador de segredos. Nunca no banco em texto claro, e nunca no código.
