---
name: seguranca
description: Revisão de segurança defensiva das mudanças do LinkedIner — autenticação e autorização nas rotas Fastify, isolamento por usuário via RLS, cifra de dados pessoais, segredos, consentimento/LGPD e injeção de prompt na IA. Use ao criar ou mexer em rotas, repositórios, migrações, filas ou qualquer caminho que toque dado do usuário ou chame o Gemini.
---

# Revisão de segurança do LinkedIner

Esta skill é **defensiva**: serve para proteger o próprio produto. Não cobre
técnicas ofensivas. Teste só o LinkedIner, nunca outro alvo.

Aplique este checklist quando a mudança criar ou alterar: uma rota em
[apps/api/src/routes/](apps/api/src/routes/), um repositório que lê/grava dado
pessoal, uma migração/tabela, uma fila, ou qualquer chamada à IA. Para cada
item: ou está coberto, ou é um achado com arquivo:linha e a correção. Não
invente problema onde o padrão do projeto já resolve.

## 1. Autenticação e autorização na rota

- Toda rota que lê dado do usuário passa por `requireActor`/`actorOf`
  ([apps/api/src/plugins/auth.ts](apps/api/src/plugins/auth.ts)). Rota nova sem
  isso é acesso anônimo — achado.
- O recurso acessado pertence ao ator: a query filtra pelo usuário do token, e
  não por um id vindo do corpo/URL. Confirmar que não dá para ler/editar o
  recurso de outra pessoa trocando o id (IDOR).
- Ações que exigem termos/privacidade aceitos usam `requireConsents`
  ([apps/api/src/plugins/require-consents.ts](apps/api/src/plugins/require-consents.ts)).
- Respostas de erro usam `ProblemDetails`; não vazam stack trace, SQL nem dado
  de outro usuário na mensagem.

## 2. Isolamento por usuário (RLS)

- Toda leitura/escrita de dado pessoal passa por `withUserContext`
  ([packages/db/src/client.ts](packages/db/src/client.ts)): ele assume o papel
  `linkediner_app` e fixa `app.current_user_id`, e é o que faz o RLS valer.
  Consulta de dado pessoal fora dele ignora o RLS — achado.
- Tabela nova com dado do usuário tem política RLS de dono na migração (ex.:
  `resume_analyses_owner`) e o `GRANT` correspondente. Sem política, a tabela
  fica legível entre usuários.
- Há (ou segue havendo) cobertura em
  [packages/db/src/rls.integration.test.ts](packages/db/src/rls.integration.test.ts)
  provando que um usuário não lê a linha de outro.

## 3. Cifra de dados pessoais

- Campo com conteúdo pessoal livre (texto de perfil, currículo, material,
  resultado de IA) é gravado com `sealJson` e lido com `openJson`
  ([field-cipher.ts](packages/core/src/modules/crypto/application/field-cipher.ts)),
  como já fazem os repositórios em `*/infrastructure/drizzle-*-repository.ts`.
  Texto pessoal em coluna aberta é achado.
- A cifra é por usuário: nada de reusar a chave de um usuário para abrir dado de
  outro.

## 4. Segredos

- Nenhum segredo, chave ou token real no código, em teste ou em fixture. Valor
  de teste é fictício. Em caso de falso positivo revisado do gitleaks, registrar
  no [.gitleaksignore](.gitleaksignore) com comentário do motivo — e lembrar que
  o próprio `.gitleaksignore` também é escaneado.
- Segredo real vem de variável de ambiente, nunca commitado. `.env*` fora do
  git.

## 5. Consentimento e LGPD

- Tabela nova com dado pessoal entra na exportação da conta em
  [drizzle-account-data-reader.ts](packages/core/src/modules/privacy/infrastructure/drizzle-account-data-reader.ts).
  Dado que não sai na exportação é dado que o usuário não consegue levar nem
  conferir — achado de LGPD.
- Apagar a conta remove (ou anonimiza) esse dado também.

## 6. Injeção de prompt na IA

Vale para todo caminho que manda dado do usuário ao Gemini (perfil, vaga colada,
texto de currículo).

- O dado do usuário entra no prompt como **conteúdo a analisar**, com
  delimitação clara, nunca concatenado como se fosse instrução do sistema.
- A instrução do sistema diz explicitamente para tratar o material do usuário
  como dado, não como ordem, e para ignorar instruções embutidas nele (ex.:
  "ignore as regras acima" dentro de um currículo).
- A saída da IA é validada pelo schema Zod do prompt antes de ser usada ou
  gravada; nada de confiar no texto cru.
- Prompt publicado não se edita: mudança vira nova versão (ver os prompts
  versionados em `packages/core/src/modules/ai/prompts/`).

## 7. Validação de entrada

- Todo corpo/parâmetro de rota tem schema Zod em
  [packages/contracts/](packages/contracts/) — sem `z.any()` escondido num
  campo que depois vira query ou prompt.
- Upload (PDF/DOCX) confere tipo e tamanho antes de processar.

## Como entregar o resultado

Liste os achados do mais grave ao menos grave, cada um com arquivo:linha, o que
expõe e a correção. Se nada aparecer, diga que passou e em quais itens você
olhou. Ao corrigir, prefira a opção que segue o padrão já existente no módulo
vizinho.
