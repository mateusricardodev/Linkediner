# ADR 0003 — Stack TypeScript: Next.js, Fastify, Drizzle e pnpm/Turborepo

- **Status:** Proposto
- **Data:** 2026-11-05
- **Decisores:** time LinkedIner

## Contexto

O time definiu TypeScript. Precisamos de frontend, API, workers longos (IA, PDF, envio de candidaturas) e contratos compartilhados. A comparação completa está em [01 — Stack](../arquitetura/01-stack.md).

## Decisão

- Monorepo com pnpm workspaces + Turborepo.
- `apps/web`: Next.js (App Router), apenas UI, consumindo a API por um cliente tipado.
- `apps/api`: Fastify + Zod (`fastify-type-provider-zod`), com OpenAPI gerado.
- `apps/worker`: Node.js + pg-boss.
- Drizzle ORM + drizzle-kit para acesso a dados e migrações.
- Vitest, Testcontainers e Playwright para testes.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Next.js full-stack | Acopla regra de negócio à UI. Inadequado para tarefas longas. |
| NestJS na API | Válido, mas decorators e convenções do framework se misturam ao domínio. Fastify mantém o domínio em TS puro. Segunda opção, caso o time prefira estrutura imposta por framework. |
| Python (FastAPI) no backend | Duas linguagens. Vantagem real só em OCR e ML, que podem virar um worker isolado no futuro. |
| Prisma | Runtime mais pesado. Drizzle é mais próximo do SQL e suporta pgvector com simplicidade. |

## Consequências

- Positivas: tipos ponta a ponta, uma linguagem só, contratos gerados.
- Negativas: fronteiras de módulo garantidas por ferramenta, não pelo framework. OCR pesado exigiria um componente extra.
