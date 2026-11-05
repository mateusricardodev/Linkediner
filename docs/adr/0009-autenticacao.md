# ADR 0009 — Autenticação com OAuth/OIDC e sessões no servidor

- **Status:** Proposto
- **Data:** 2026-11-05
- **Decisores:** time LinkedIner

## Contexto

Usuários precisam entrar com Google, GitHub e LinkedIn, ou por e-mail. Não podemos guardar senhas de contas externas, e os escopos devem ser mínimos.

## Decisão

- Biblioteca de autenticação self-hosted em TypeScript, com dados no nosso Postgres. Candidata: Better Auth; alternativa: Auth.js. Escolha confirmada na Fase 3, depois de checar manutenção e suporte a OIDC.
- Provedores: Google, GitHub, LinkedIn ("Sign In with LinkedIn using OpenID Connect") e e-mail com senha (Argon2id).
- Sessões em cookie `HttpOnly`, guardadas no servidor e revogáveis.
- Escopos mínimos no login. Escopos extras pedidos de forma incremental.
- Tudo atrás de uma porta `AuthProvider`, para permitir a troca por um serviço gerenciado.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Clerk / Auth0 | Bons, mas custo por usuário ativo e dados de identidade fora do nosso banco. Ficam como opção se o time quiser terceirizar. |
| Supabase Auth | Acopla ao provedor de banco |
| JWT no navegador | Revogação difícil |

## Consequências

- Positivas: controle total dos dados de identidade e custo baixo.
- Negativas: a segurança do fluxo de autenticação fica sob nossa responsabilidade. Exige testes e atualização constante da biblioteca.
