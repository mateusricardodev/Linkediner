# LinkedIner

Copiloto de carreira que ajuda profissionais de tecnologia a encontrar, adaptar e acompanhar candidaturas relevantes para vagas remotas, no Brasil e no exterior.

> Nome provisório. Fase atual: fundação do projeto (monorepo, API, worker, banco e web base).

## Como rodar localmente

Pré-requisitos: Node.js 22.12+, pnpm 10 (`corepack enable`) e Docker.

```bash
pnpm install
```

```bash
cp .env.example .env
```

```bash
pnpm infra:up
```

```bash
pnpm db:migrate
```

```bash
pnpm dev
```

| Serviço                       | Endereço                   |
| ----------------------------- | -------------------------- |
| Web (Next.js)                 | http://localhost:3000      |
| API (Fastify)                 | http://localhost:4000      |
| Documentação da API (OpenAPI) | http://localhost:4000/docs |
| Mailpit (e-mails locais)      | http://localhost:8025      |

## Autenticação

- Login por e-mail e senha (Argon2id) e por OAuth (Google, GitHub e LinkedIn via OpenID Connect).
- Cada provedor OAuth só é ativado quando o ID e o segredo estão no `.env`.
- Sessão em cookie HttpOnly. As rotas do Better Auth ficam em `/v1/auth/*`.
- Depois do cadastro, o usuário precisa aceitar termos e privacidade (`PUT /v1/me/consents/{purpose}`) para usar o produto.

## Comandos

| Comando                             | O que faz                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `pnpm dev`                          | Sobe web, API e worker em modo desenvolvimento                              |
| `pnpm test`                         | Testes de unidade e integração (os de integração sobem Postgres via Docker) |
| `pnpm lint` / `pnpm typecheck`      | ESLint e TypeScript                                                         |
| `pnpm arch`                         | Verifica as fronteiras entre módulos (ADR 0002)                             |
| `pnpm format`                       | Formata o código com Prettier                                               |
| `pnpm db:generate`                  | Gera migração a partir do schema Drizzle                                    |
| `pnpm db:migrate`                   | Aplica as migrações                                                         |
| `pnpm infra:up` / `pnpm infra:down` | Sobe ou derruba Postgres, S3 local e Mailpit                                |

## Estrutura

```text
apps/
  web/        Next.js: só interface
  api/        Fastify: HTTP, autenticação, casos de uso síncronos
  worker/     pg-boss: tarefas assíncronas
packages/
  core/       Domínio e casos de uso, por módulo
  db/         Schema Drizzle, migrações, RLS
  contracts/  Esquemas Zod da API
  config/     Validação das variáveis de ambiente
  observability/  Logger com redação de dados pessoais
  ui/         Design tokens (claro e escuro)
infra/        Docker Compose do ambiente local
```

## Documentação

- [Arquitetura](docs/arquitetura/README.md): stack, módulos, modelo de dados, fluxos, segurança, roadmap.
- [ADRs](docs/adr/README.md): registro das decisões técnicas.
- Design: [Figma — LinkedIner Design System](https://www.figma.com/design/FkC4mVIynAoY6T4IOguaQq)

## Princípios do produto

- Nenhuma candidatura é enviada sem aprovação explícita do usuário.
- A IA não inventa experiências, empresas, cargos, resultados, tecnologias ou certificações. O que não estiver comprovado aparece como sugestão a confirmar.
- O score é explicável e **não** representa probabilidade de contratação.
- Sem scraping ou automação não autorizada. Integrações só por APIs oficiais, parcerias, feeds permitidos ou importação manual.
- Dados dos usuários não são usados para treinar modelos sem consentimento específico e explícito.
