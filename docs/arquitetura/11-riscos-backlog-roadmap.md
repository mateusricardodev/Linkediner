# 11 — Riscos, decisões adiadas, backlog e roadmap

## 21. Riscos técnicos

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | Poucas fontes permitem candidatura automática. A proposta de valor "candidatura automática" fica limitada. | Alta | Alto | Candidatura assistida excelente como caminho principal. Parcerias com empresas que usam Greenhouse ou Lever. Comunicação honesta no marketing. |
| R2 | A IA inventa informação no currículo | Média | Alto | Grounding com `fact_ids`, validador pós-geração, sugestões destacadas, avaliação contínua ([05](05-ia-e-documentos.md)) |
| R3 | Custo de IA cresce mais rápido que a receita | Média | Alto | Quotas, cache por hash, modelos baratos para tarefas simples, alerta de orçamento diário |
| R4 | Uso de dados reais no plano gratuito do Gemini viola a promessa de privacidade | Média | Alto | Bloqueio por configuração: em produção, a aplicação recusa subir com chave do plano gratuito (flag `AI_TIER=paid` obrigatória) |
| R5 | Mudança de termos ou de API de uma fonte | Média | Médio | Adaptadores isolados, disjuntor por fonte, revisão periódica de termos, importação manual como alternativa |
| R6 | Vazamento de dados entre usuários | Baixa | Crítico | Filtros na aplicação + RLS + testes de acesso cruzado em todo endpoint |
| R7 | Exclusão incompleta (dados em backup, cache ou provedor externo) | Média | Alto | Crypto-shredding, checklist de expurgo testado, inventário de onde há dado pessoal |
| R8 | Extração ruim de PDFs com layout complexo ou escaneados | Média | Médio | Parser dedicado para o PDF do LinkedIn, fallback multimodal, revisão dos fatos pelo usuário |
| R9 | Score percebido como injusto ou opaco | Média | Médio | Rubrica determinística, explicações, aviso de que não é chance de contratação, sem atributos sensíveis |
| R10 | Postgres sobrecarregado com fila + vetores + OLTP | Baixa (MVP) | Médio | Monitorar. Plano de saída: Redis/SQS para a fila e réplica de leitura para métricas. |
| R11 | Baixa taxa de usuários que informam o resultado (entrevista), o que enfraquece a métrica principal | Alta | Médio | Pedido leve e no momento certo. Integração futura com e-mail (com consentimento) para detectar convites. |

## Decisões que devem ser adiadas

| Decisão | Por que adiar | Gatilho para decidir |
|---|---|---|
| Microserviços | Sem escala nem time que justifiquem | Um módulo exigir escala ou ciclo de deploy próprio |
| Fila dedicada (Redis/SQS) | pg-boss basta para o MVP | Ver [08](08-operacao.md) |
| Banco vetorial dedicado | pgvector basta | Milhões de vetores ou latência medida acima do aceitável |
| Treinamento ou ajuste fino de modelo próprio | Exige consentimento, volume e governança | Consentimento `model_training` implementado + volume de feedback relevante |
| Ranking com aprendizado de máquina | Regras explicáveis bastam no início | Volume de feedback suficiente para avaliar offline |
| Extensão de navegador para preencher formulários | Risco de uso em sites que proíbem automação | Desenho com lista de domínios permitidos e revisão jurídica |
| Fontes de vagas além de importação manual + Greenhouse/Lever | Termos e APIs variam | Parceria ou API oficial disponível |
| Pix / Mercado Pago | Stripe cobre o começo | Demanda medida de usuários no Brasil |
| Separação de dados por região | LGPD não exige localização no Brasil | Exigência contratual ou legal de algum mercado |
| App mobile | Web responsiva atende | Uso mobile relevante medido |

## 23. Backlog técnico do MVP

Ordem de implementação seguindo a Fase 4 do escopo. Cada item inclui testes.

### Fase 3 — Fundação
| ID | Item |
|---|---|
| F-01 | Monorepo pnpm + Turborepo, TS strict, ESLint, Prettier, dependency-cruiser |
| F-02 | `packages/config` com validação Zod das variáveis + `.env.example` |
| F-03 | `docker compose` local: Postgres com pgvector, MinIO, Mailpit |
| F-04 | `packages/db`: Drizzle, primeira migração (users, consents, audit_logs), RLS base |
| F-05 | `packages/observability`: logger com redação de PII, OpenTelemetry, Sentry |
| F-06 | `apps/api`: Fastify, tratamento de erros RFC 9457, health check, OpenAPI |
| F-07 | `apps/worker`: pg-boss, handler de exemplo, fila de falhas |
| F-08 | `apps/web`: Next.js, tokens do design system, layout com sidebar |
| F-09 | CI: lint, typecheck, testes, regras de arquitetura, varredura de segredos |
| F-10 | `FakeAiProvider` e porta `AiProvider` |

### Fase 4 — MVP
| ID | Item (escopo do prompt) |
|---|---|
| M-01 | Cadastro e login (OAuth Google, GitHub e LinkedIn; e-mail e senha), sessões, consentimentos |
| M-02 | Perfil profissional e objetivos de carreira (múltiplos) |
| M-03 | Upload de currículo (URL assinada, validação, storage com expiração) |
| M-04 | Upload do PDF do LinkedIn (parser dedicado) |
| M-05 | Extração de dados: fatos com `source_span` e validação de referência |
| M-06 | Score do perfil: rubrica v1 + explicações |
| M-07 | Currículo melhorado com validador anti-invenção e sugestões a confirmar |
| M-08 | Aprovação do usuário e exportação PDF/DOCX (marca d'água no gratuito) |
| M-09 | Importação manual de vaga (texto e URL) e estruturação |
| M-10 | Score de compatibilidade (rubrica + embeddings) com fatores |
| M-11 | Feedback da vaga e preferências v1 |
| M-12 | Dashboard inicial (pendências, candidaturas por estado) e candidatura assistida |
| M-13 | Exclusão de dados (expurgo completo + crypto-shredding) e exportação |
| M-14 | Planos, entitlements, ledger de consumo, checkout Stripe |
| M-15 | Eventos de produto e views das métricas |
| M-16 | `GeminiProvider` (plano pago) + conjunto de avaliação de IA |

## 24. Roadmap por fases

| Fase | Entregas | Critério de saída |
|---|---|---|
| **0. Arquitetura** (atual) | Este documento, ADRs, design no Figma | Arquitetura aprovada |
| **1. Fundação** | F-01 a F-10 | `docker compose up` + `pnpm dev` sobem tudo. CI verde. |
| **2. MVP Perfil** | M-01 a M-08 | Usuário de teste envia currículo, vê o score e exporta o currículo aprovado |
| **3. MVP Vagas** | M-09 a M-12 | Importa vaga, vê compatibilidade, dá feedback e acompanha no dashboard |
| **4. MVP Confiança e negócio** | M-13 a M-16 | Exclusão e exportação testadas, planos funcionando, Gemini pago ativo |
| **5. Beta fechado** | 20 a 50 usuários reais | Respostas B1 e B3 resolvidas. Métricas coletadas. Taxa de invenção zero na avaliação. |
| **6. Fontes autorizadas** | Listagem Greenhouse/Lever por empresa, recomendações automáticas, monitoramento | Recomendações úteis (aprovação ≥ meta) |
| **7. Automação autorizada** | `apply_api` com empresa parceira (B2) | Primeira candidatura automática real com aprovação e registro completos |
| **8. Plano avançado** | Análise ampliada de GitHub e portfólio, simulação de entrevistas, regras avançadas de candidatura | Conversão para o plano avançado |

## Perguntas realmente bloqueadoras

Repetidas de [00 — Descoberta](00-descoberta.md):

1. **B1:** quando o projeto passa a usar IA paga, sem uso dos dados para treino? (bloqueia o beta)
2. **B2:** qual será a primeira fonte autorizada com API de candidatura e um parceiro para testar? (bloqueia a automação)
3. **B3:** haverá orientação jurídica para LGPD e termos antes do beta? (bloqueia o beta)
