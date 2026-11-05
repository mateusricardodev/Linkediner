# 10 — Contratos de API e eventos

## API REST

- Prefixo `/v1`. Esquemas Zod em `packages/contracts` geram a especificação OpenAPI e o cliente tipado usado pelo `web`.
- Autenticação por cookie de sessão. Mutações exigem token CSRF.
- Erros no formato RFC 9457 (`application/problem+json`), com `code` estável. Exemplos: `QUOTA_EXCEEDED`, `CONSENT_REQUIRED`, `INVALID_STATE_TRANSITION`.
- Mutações aceitam o cabeçalho `Idempotency-Key`.
- Paginação por cursor.

### Endpoints iniciais (MVP)

| Método e rota | Descrição |
|---|---|
| `POST /v1/auth/*` | Rotas da biblioteca de autenticação (login, OAuth callback, logout) |
| `GET /v1/me` | Usuário, plano, consentimentos, uso do período |
| `PUT /v1/me/consents/{purpose}` | Conceder ou revogar consentimento |
| `GET/POST /v1/career-goals`, `PATCH/DELETE /v1/career-goals/{id}` | Objetivos de carreira |
| `POST /v1/documents` | Criar documento e receber URL assinada de upload |
| `POST /v1/documents/{id}/complete` | Confirmar upload e iniciar a extração |
| `POST /v1/documents/{id}/extract` | Pedir a análise do documento (exige o consentimento `ai_processing`) |
| `DELETE /v1/documents/{id}` | Apagar documento e dados derivados |
| `GET /v1/documents/{id}` | Status da extração |
| `GET /v1/profile` | Perfil e links |
| `GET /v1/profile/facts` | Fatos do perfil e estados de verificação |
| `PATCH /v1/profile/facts/{id}` | Confirmar, editar ou rejeitar um fato |
| `PUT /v1/profile/links` | Links profissionais |
| `GET /v1/profile/score` | Score atual + fatores + histórico resumido |
| `POST /v1/resumes` | Gerar currículo melhorado (sem vaga). Assíncrono: responde 202 |
| `PATCH /v1/resumes/{id}/items/{itemId}` | Confirmar, corrigir ou remover uma frase |
| `GET /v1/resumes/{id}`, `POST /v1/resumes/{id}/approve`, `GET /v1/resumes/{id}/export?format=pdf\|docx` | Revisão, aprovação e exportação |
| `POST /v1/jobs/import` | Importar vaga pelo texto colado. O link é só referência e nunca é acessado ([ADR 0015](../adr/0015-vagas-importadas-por-usuario.md)) |
| `GET /v1/jobs/recommendations?goalId=` | Vagas recomendadas, com score e explicação |
| `GET /v1/jobs/{id}` | Detalhe da vaga |
| `GET /v1/jobs/{id}/match?goalId=` | Compatibilidade requisito por requisito ([ADR 0016](../adr/0016-compatibilidade-v1-por-regras.md)) |
| `POST /v1/jobs/{id}/feedback` | Feedback da vaga |
| `POST /v1/applications` | Criar candidatura e gerar material |
| `GET /v1/applications?state=` | Lista para o dashboard |
| `GET /v1/applications/{id}` | Detalhe, material e histórico |
| `PATCH /v1/applications/{id}/materials/{materialId}` | Editar material (volta o estado para `in_review`) |
| `POST /v1/applications/{id}/approve` | Aprovar (verifica quota e consentimento) |
| `POST /v1/applications/{id}/reject` | Rejeitar |
| `POST /v1/applications/{id}/manual-complete` | Usuário informa que enviou manualmente |
| `POST /v1/applications/{id}/outcome` | Informar entrevista, rejeição ou encerramento |
| `GET /v1/dashboard` | Resumo: pendências, enviadas, falhas, bloqueios |
| `POST /v1/privacy/export` | Pedir exportação |
| `POST /v1/privacy/delete-account` | Pedir exclusão |
| `POST /v1/billing/checkout`, `POST /v1/billing/webhook` | Assinatura |
| `GET /v1/events/stream` | SSE com atualizações de status (extração, geração, envio) |

### Exemplo de contrato

```ts
// packages/contracts/src/applications.ts
export const ApplicationState = z.enum([
  'recommended', 'saved', 'analyzing', 'in_review', 'awaiting_approval', 'approved',
  'sending', 'sent', 'failed', 'blocked_by_source', 'manual_action_required',
  'interview_received', 'rejected', 'closed',
]);

export const MatchFactor = z.object({
  kind: z.enum(['positive', 'gap', 'recommendation']),
  label: z.string(),            // "React e TypeScript: 6 anos (pede 5+)"
  factIds: z.array(z.string().uuid()),
});

export const ApplicationDetail = z.object({
  id: z.string().uuid(),
  state: ApplicationState,
  job: JobSummary,
  match: z.object({ score: z.number().int().min(0).max(100), rubricVersion: z.string(), factors: z.array(MatchFactor) }),
  materials: z.array(MaterialSummary),
  submissionMode: z.enum(['api', 'assisted', 'manual']).nullable(),
  history: z.array(ApplicationEventDto),
});
```

## Eventos de domínio

São publicados pela outbox. O payload carrega IDs e metadados, nunca conteúdo pessoal. O envelope é comum a todos:

```ts
{ id: uuid, type: 'ApplicationApproved', version: 1, occurredAt: iso8601, userId: uuid, data: { ... } }
```

| Evento | Produzido por | Consumido por |
|---|---|---|
| `DocumentUploaded` | documents | documents (extração) |
| `ProfileExtracted` | documents/profile | profile (score), matching (embeddings) |
| `ProfileScored` | profile | analytics, notifications |
| `FactConfirmed` / `FactRejected` | profile | profile (recalcular score) |
| `JobImported` | jobs | jobs (estruturação), matching |
| `JobMatched` | matching | analytics |
| `JobFeedbackRecorded` | matching | matching (preferências), analytics |
| `MaterialGenerated` | applications | notifications |
| `ApplicationApproved` | applications | applications (envio), billing, analytics |
| `ApplicationSent` / `ApplicationFailed` / `ApplicationBlocked` | applications | notifications, analytics |
| `ManualActionRequired` | applications | notifications |
| `ApplicationOutcomeReported` | applications | analytics, matching |
| `ConsentChanged` | privacy | applications (cancelar envios se `auto_apply` for revogado), ai |
| `UserDeletionRequested` | privacy | todos os módulos (expurgo) |
| `UserDataPurged` | privacy | auditoria, notifications |
| `SubscriptionChanged` | billing | billing (entitlements), notifications |

Os eventos são versionados (`version`). Uma mudança incompatível cria uma nova versão, e as duas convivem durante a migração.
