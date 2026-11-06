# 07 — Segurança e privacidade

## 6. Autenticação e autorização

### Autenticação ([ADR 0009](../adr/0009-autenticacao.md))

- Login por OAuth/OIDC (Google, GitHub, LinkedIn via "Sign In with LinkedIn using OpenID Connect") e por e-mail com senha.
- Senhas do nosso próprio login: hash com Argon2id. **Senhas de contas externas nunca são pedidas nem armazenadas.**
- Sessões no servidor (cookie `HttpOnly`, `Secure`, `SameSite=Lax`), guardadas no Postgres e revogáveis. Sem JWT de longa duração no navegador.
- Verificação de e-mail, limite de tentativas de login e, no futuro, passkeys e MFA.
- Escopos mínimos de OAuth: no login, só identidade e e-mail. Escopos adicionais (por exemplo, leitura de repositórios públicos do GitHub para a análise ampliada) são pedidos à parte, quando a funcionalidade for usada.

### Autorização

- **Por dono do recurso:** cada caso de uso recebe um `Actor` (usuário autenticado) e só acessa recursos com o mesmo `user_id`. Isso é reforçado por RLS no banco ([02 — Multi-tenancy](02-arquitetura-geral.md)).
- **Por plano:** o módulo `billing` responde `can(actor, feature)` com base nos entitlements, e não em `if (plan === 'pro')` espalhado pelo código.
- **Papéis internos:** `user` e `admin`. Acesso administrativo a dados de usuários é auditado e restrito a suporte com motivo registrado.
- **Workers:** atuam em nome do usuário dono da tarefa (`actor = system:on_behalf_of(userId)`), com as mesmas verificações.

## 11. Segurança

| Área | Medida |
|---|---|
| Transporte | TLS em tudo, HSTS |
| Repouso | Criptografia do provedor no banco e no storage. Criptografia de aplicação (envelope) para fatos, saídas de IA, currículos e materiais, com uma chave por usuário fora do banco ([ADR 0020](../adr/0020-criptografia-por-usuario.md)). |
| Segredos | Variáveis de ambiente injetadas pelo gerenciador de segredos da plataforma. `.env` só local e no `.gitignore`. Varredura de segredos no CI (gitleaks). |
| Entrada | Validação com Zod em toda fronteira (HTTP, fila, resposta de IA, resposta de fonte externa) |
| Uploads | Tipo real verificado, tamanho limitado, processamento isolado no worker, URLs assinadas de curta duração |
| Injeção de prompt | O conteúdo de currículos e vagas é tratado como dado: vai em seções delimitadas, e a saída é sempre validada por esquema. A IA não tem ferramentas com efeito colateral, ou seja, não envia nada e não acessa a rede. |
| Web | CSP (scripts em linha ainda permitidos, porque o Next.js precisa deles sem nonce), proteção CSRF, cabeçalhos de segurança, limite de requisições por IP. O site e a API precisam estar no mesmo domínio principal, para o cookie de sessão acompanhar as chamadas |
| Dependências | Renovate/Dependabot, `pnpm audit` no CI, lockfile versionado |
| Logs | Sem PII: redação automática no logger ([08](08-operacao.md)) |
| Auditoria | `audit_logs` para login, mudança de consentimento, aprovação, envio, exportação, exclusão e acesso administrativo |

## Privacidade e LGPD

| Requisito | Implementação |
|---|---|
| Base legal e consentimento | `consents` versionado por finalidade. Termos e privacidade são obrigatórios. IA, automação de candidatura, marketing e treinamento de modelos são consentimentos separados. |
| Revogação | Revogar `ai_processing` interrompe novas análises. Revogar `auto_apply` cancela envios pendentes. Cada revogação fica registrada. |
| Minimização | A IA recebe o perfil pseudonimizado, sem atributos sensíveis. Coletamos só o que o produto usa. |
| Retenção de 30 dias para documentos | Regra de ciclo de vida no storage + job diário `privacy.expire_documents`, que apaga arquivo, texto extraído e cache derivado |
| Exclusão imediata | Fluxo F8 ([04](04-fluxos.md)), com a política de exclusão abaixo |
| Exportação (portabilidade) | Fluxo F9 ([04](04-fluxos.md)) |
| Separação entre usuários | Filtros na aplicação + RLS |
| Usuários internacionais | Campo `data_region`. Textos legais por localidade. Cláusulas contratuais com subprocessadores para transferência internacional. |
| Registro de operações | `audit_logs` + inventário de subprocessadores (provedor de IA, nuvem, pagamento, e-mail) mantido em `docs/` |
| Encarregado (DPO) e canal do titular | A definir com orientação jurídica ([00 — B3](00-descoberta.md)) |

### Política de exclusão por tipo de dado

| Onde | O que é apagado | Como |
|---|---|---|
| Arquivos | Originais, currículos gerados, exportações | `DELETE` no storage, por prefixo `users/{userId}/` |
| Dados derivados | Fatos, perfil, scores, matches, preferências, materiais | Cascata no banco |
| Cache | Respostas de IA em cache, por `input_hash` | Apagadas junto com as gerações do usuário |
| Embeddings | Perfil e objetivos | `DELETE` em `embeddings` onde `user_id` = usuário |
| Gerações de IA | Entradas e saídas | Cascata + chave destruída |
| Logs | Não contêm PII | Expiram em 30 dias |
| Tarefas pendentes | Extrações, gerações, envios | Canceladas no pg-boss antes do expurgo |
| Provedor de IA | Arquivos enviados à API (se houver upload de arquivo) | Apagados via API logo após o uso. Não usamos armazenamento persistente do provedor. |
| Backups | Cópias do banco | Conteúdo de carreira ilegível por crypto-shredding. O restante expira com o backup ([ADR 0020](../adr/0020-criptografia-por-usuario.md)) |
| Auditoria | Registros do usuário | Mantidos com `actor_id` pseudonimizado (obrigação legal) |
