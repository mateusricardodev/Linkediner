# 08 — Operação: filas, observabilidade, testes e deploy

## 9. Filas e tarefas assíncronas

**pg-boss sobre o próprio Postgres** ([ADR 0005](../adr/0005-filas-pg-boss.md)): nenhuma peça nova de infraestrutura, e enfileirar a tarefa pode acontecer na mesma transação da mudança de dados.

| Fila | Tarefa | Repetições | Tempo limite |
|---|---|---|---|
| `documents.extract` | Extrair texto e fatos de um documento | 3, com backoff | 2 min |
| `profile.score` | Calcular o score do perfil | 3 | 1 min |
| `jobs.structure` | Estruturar uma vaga importada | 3 | 1 min |
| `jobs.sync_source` | Sincronizar uma fonte autorizada (agendada) | 5 | 10 min |
| `matching.compute` | Calcular a compatibilidade de vagas para um objetivo | 3 | 2 min |
| `matching.update_preferences` | Aplicar feedback | 3 | 30 s |
| `applications.generate_materials` | Gerar currículo, carta e respostas | 2 | 3 min |
| `applications.submit` | Enviar candidatura ou criar pendência manual | 3, só para erro técnico | 2 min |
| `privacy.purge_user` | Exclusão completa | Até concluir | 10 min |
| `privacy.expire_documents` | Expirar documentos com mais de 30 dias (diária) | 3 | 30 min |
| `privacy.export_user` | Exportar dados | 3 | 10 min |
| `outbox.publish` | Publicar eventos da outbox | Contínua | — |
| `notifications.send` | Enviar e-mail | 5 | 30 s |

**Regras:**
- Todo handler é idempotente, com chave de idempotência por tarefa.
- O payload da fila leva IDs, não dados pessoais.
- Tarefas que esgotam as tentativas vão para uma fila de falhas (dead letter), com alerta.
- Concorrência por fila é configurável. As tarefas de IA têm limite próprio para respeitar a cota do provedor.
- **Gatilho para migrar para Redis/BullMQ ou SQS:** throughput sustentado acima de centenas de tarefas por segundo, ou contenção medida no Postgres.

## 10. Observabilidade e logs

| Sinal | Ferramenta | Conteúdo |
|---|---|---|
| Logs | pino, em JSON | `requestId`, `userId` pseudonimizado (hash), módulo, evento, duração. Lista de redação automática (`email`, `name`, `text`, `content`, `resume`, `token`, `authorization`...). |
| Traces | OpenTelemetry → backend compatível com OTLP | API → fila → worker → IA/fonte, com o mesmo `traceId` |
| Erros | Sentry, com `beforeSend` removendo PII | Stack traces, sem payloads |
| Métricas técnicas | OpenTelemetry metrics | Latência p50/p95 por rota, profundidade das filas, falhas por fonte, tokens e custo de IA por tarefa, taxa de validação anti-invenção |
| Métricas de produto | `product_events` no Postgres | Ver [09](09-planos-quotas-metricas.md) |

**Regras:**
- É proibido logar documentos, textos extraídos, prompts renderizados ou respostas da IA. Para depurar, use o `ai_generation_id` e consulte com acesso auditado.
- Um teste automatizado injeta PII conhecida num fluxo completo e verifica que ela não aparece nos logs capturados.
- Alertas para: fila de falhas com itens, taxa de falha de envio acima do limiar, custo diário de IA acima do orçamento, erro 5xx acima de 1%.

## 19. Testes

| Nível | Ferramenta | O que cobre |
|---|---|---|
| Unidade (domínio) | Vitest | Máquina de estados, rubricas de score, regras de quota, validador anti-invenção. Rápidos e sem I/O. |
| Integração | Vitest + Testcontainers (Postgres com pgvector; S3 local quando o módulo de documentos entrar) | Repositórios, políticas de RLS, migrações, handlers de fila |
| Contrato de adaptadores | Vitest + respostas gravadas | Cada `JobSourceAdapter` e o `GeminiProvider` contra fixtures. Um teste de contrato compartilhado garante que todo adaptador segue a interface. |
| API | Vitest + `fastify.inject` | Autenticação, autorização (acesso a dados de outro usuário deve falhar), validação, quotas |
| Avaliação de IA | Conjunto próprio em `tests/ai-evals` | 30 a 50 currículos sintéticos com fatos esperados. Mede precisão da extração, taxa de invenção (meta: 0 alegações sem fonte aprovadas) e estabilidade do score. Roda a cada mudança de prompt ou de modelo. |
| Privacidade | Integração | Exclusão apaga tudo (inclusive embeddings e storage), expiração de 30 dias funciona, logs não têm PII |
| Ponta a ponta | Playwright | Fluxos do MVP: cadastro → upload → score → currículo → aprovação → importação de vaga → compatibilidade → feedback → exclusão |
| Arquitetura | dependency-cruiser | O domínio não importa infraestrutura, e um módulo não acessa arquivos internos de outro |

O CI roda lint, typecheck, testes de unidade, integração e arquitetura em todo PR. Avaliações de IA e testes ponta a ponta rodam no merge e diariamente.

## 20. Deploy

| Ambiente | Como |
|---|---|
| **Local** | `docker compose up` sobe Postgres com pgvector, SeaweedFS (S3 local) e Mailpit (e-mail). Apps em modo dev com `pnpm dev`. `FakeAiProvider` por padrão. Gemini opcional, com chave pessoal e dados sintéticos. Seeds com usuários e vagas fictícios. |
| **Staging** | Mesma imagem de produção. Banco e storage separados. Dados somente sintéticos. Deploy automático a cada merge na `main`. |
| **Produção** | Deploy por tag ou aprovação manual. Migrações rodam antes de subir a nova versão, e precisam ser compatíveis com a versão anterior (expandir e depois contrair). Rollback pela imagem anterior. |

**Empacotamento:** imagens Docker para `api` e `worker`. O worker de geração de PDF inclui o Chromium. O `web` vai para uma plataforma de frontend ou para o mesmo PaaS de containers.

**Configuração:** `packages/config` valida todas as variáveis com Zod na inicialização e falha cedo se faltar alguma. Nenhum segredo vai para o código ou para o repositório.

**Sugestão de hospedagem para o MVP**, a confirmar conforme o orçamento ([00](00-descoberta.md)):
- Postgres gerenciado com pgvector (Supabase ou Neon), em região de São Paulo se disponível;
- Cloudflare R2 ou S3;
- API e worker num PaaS de containers (Fly.io, Railway ou Render);
- web na Vercel ou no mesmo PaaS.

A arquitetura não depende de nenhum desses provedores.
