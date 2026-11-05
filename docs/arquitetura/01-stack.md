# 01 — Stack

## Critérios de comparação

Velocidade de desenvolvimento, custo, escalabilidade, manutenção, integrações externas, processamento de documentos, IA, segurança e experiência do time. A linguagem TypeScript já foi definida pelo time. Ainda assim, comparamos com Python, a principal alternativa para um produto centrado em IA e documentos, para deixar o trade-off registrado.

## 2. Comparação de linguagens

| Critério | TypeScript (Node.js) | Python (FastAPI) |
|---|---|---|
| Velocidade de desenvolvimento | Uma linguagem só no front e no back, com tipos e esquemas compartilhados (Zod) entre API e UI | Exige duas linguagens (Python no back, TS no front) |
| IA | SDK oficial do Gemini (`@google/genai`), Vercel AI SDK e saída estruturada com Zod. Suficiente: não vamos treinar modelos. | Ecossistema mais rico para ML e treino de modelos |
| PDFs e documentos | pdf.js/unpdf (texto), mammoth (DOCX), Playwright (gerar PDF). OCR mais fraco. | pdfplumber, PyMuPDF e OCR mais maduros |
| Integrações (OAuth, pagamentos, APIs de ATS) | Excelente | Excelente |
| Custo de infraestrutura | Baixo. I/O assíncrono eficiente para muitas chamadas externas. | Baixo |
| Manutenção | Tipos ponta a ponta reduzem erros de contrato | Tipagem mais fraca entre serviços |
| Experiência do time | Escolha do time | — |

**Conclusão:** TypeScript atende bem. A extração de texto de PDFs digitais é resolvida em Node, e o caso difícil (PDF escaneado, sem texto) é recusado por enquanto ([ADR 0012](../adr/0012-extracao-so-com-texto-verificavel.md)). Se OCR virar necessidade real, um worker isolado em Python pode ser adicionado atrás da interface `TextExtractor`, sem mudar o domínio.

## Comparação de frameworks (dentro de TypeScript)

| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| **A. Next.js full-stack** (Server Actions/Route Handlers para tudo) | Menos peças, deploy único | Regras de negócio tendem a vazar para a UI. Jobs longos (IA, PDF, envio de candidaturas) não cabem em funções serverless. API pública fica acoplada ao front. | Descartado como backend |
| **B. Next.js (web) + NestJS (API) + worker** | Módulos e injeção de dependência embutidos, convenções fortes | Decorators e "mágica" do framework se misturam ao domínio. Mais cerimônia. | Alternativa válida |
| **C. Next.js (web) + Fastify (API) + worker, com módulos próprios** | Leve e rápido. Domínio em TypeScript puro, sem dependência de framework. Validação com Zod e OpenAPI gerado. | As fronteiras entre módulos precisam ser garantidas por ferramenta (dependency-cruiser) e não pelo framework | **Recomendado** |

## 3. Recomendação final

| Camada | Escolha | Justificativa |
|---|---|---|
| Linguagem | TypeScript (strict) | Decisão do time. Tipos compartilhados ponta a ponta. |
| Monorepo | pnpm workspaces + Turborepo | Vários apps e pacotes com builds em cache |
| Frontend | Next.js (App Router) + React | SSR para páginas públicas. Consome a API, não acessa o banco. |
| UI | CSS Modules + tokens do design system (Style Dictionary) | Visual próprio no estilo Apple, sem cara de template ([ADR 0011](../adr/0011-design-tokens.md)) |
| API | Fastify + Zod + `fastify-type-provider-zod` | Contrato validado e OpenAPI gerado a partir dos esquemas |
| Worker | Node.js + pg-boss | Mesma base de código da API, outro processo ([ADR 0005](../adr/0005-filas-pg-boss.md)) |
| Banco | PostgreSQL 16+ com pgvector | [ADR 0001](../adr/0001-banco-de-dados.md) |
| Acesso a dados | Drizzle ORM + drizzle-kit (migrações) | SQL explícito, tipado, com suporte a pgvector e sem runtime pesado |
| Arquivos | Storage compatível com S3 (R2, S3 ou Supabase Storage) | Retenção por regra de ciclo de vida |
| Autenticação | Biblioteca self-hosted com sessões no nosso Postgres (candidata: Better Auth; alternativa: Auth.js). Validar na Fase 3. | [ADR 0009](../adr/0009-autenticacao.md) |
| IA | `AiProvider` próprio. Primeira implementação: Gemini via `@google/genai`. | [ADR 0004](../adr/0004-provedor-de-ia.md) |
| PDF | unpdf/pdf.js (texto), mammoth (DOCX), Playwright/Chromium (geração) | [05 — IA e documentos](05-ia-e-documentos.md) |
| Pagamentos | `PaymentProvider`, primeira implementação Stripe | Cobrança internacional. Pix depois. |
| E-mail | `Mailer`, primeira implementação Resend ou SES | Transacional apenas |
| Observabilidade | OpenTelemetry + pino (com redação de PII) + Sentry | [08 — Operação](08-operacao.md) |
| Testes | Vitest, Testcontainers, Playwright, avaliações de IA | [08 — Operação](08-operacao.md) |
| Qualidade | ESLint, Prettier, dependency-cruiser, tsc strict | Fronteiras entre módulos verificadas no CI |

## Custos estimados (ordem de grandeza, MVP)

| Item | Faixa |
|---|---|
| Postgres gerenciado (plano inicial pago) | US$ 0–25/mês |
| Storage de objetos | Centavos a poucos dólares (arquivos expiram em 30 dias) |
| Containers (API + worker) | US$ 10–40/mês |
| Frontend | US$ 0–20/mês |
| IA (Gemini pago) | Variável: proporcional ao uso. Controlado por quota por plano e cache de resultados. |

Os valores são estimativas para orientar a decisão e devem ser confirmados nos sites dos provedores. O maior risco de custo é a IA, por isso cada geração passa pelo controle de quota ([09](09-planos-quotas-metricas.md)).
