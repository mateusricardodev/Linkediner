# ADR 0027 — Login com LinkedIn, Termos de Uso e Política de Privacidade

- **Status:** Proposto
- **Data:** 2026-11-09
- **Decisores:** time LinkedIner

## Contexto

O ADR 0009 já previa o login com LinkedIn, e a API o ativa quando há ID e segredo configurados. Faltavam o tratamento de erro na tela e uma decisão sobre juntar contas. Os consentimentos de termos e privacidade existiam sem um texto publicado para ler.

## Decisão

### Login com LinkedIn

- **"Sign In with LinkedIn using OpenID Connect"**, com os escopos `openid profile email`: só nome, e-mail e foto. O LinkedIn não libera experiências e formação para apps como o nosso, e o PDF do perfil continua sendo o caminho para importar o currículo.
- O botão aparece só para os provedores de `NEXT_PUBLIC_AUTH_PROVIDERS`, que precisam ter ID e segredo na API.
- **Login social não se liga a uma conta com senha de e-mail não confirmado** (`requireLocalEmailVerified`, deixado explícito). O cadastro por e-mail ainda não confirma o endereço: ligar as contas daria acesso a quem cadastrou o e-mail de outra pessoa. A tela explica e pede para entrar com e-mail e senha.
- Erros do provedor voltam para a tela de login (`errorCallbackURL`), com mensagem em português, e não para uma página da API.
- Endereço de retorno a cadastrar no app do LinkedIn: `{API_PUBLIC_URL}/v1/auth/callback/linkedin`.

### Termos de Uso e Política de Privacidade

- Páginas públicas `/termos` e `/privacidade`, escritas a partir do que o sistema faz: dados tratados, bases legais, IA, operadores, retenção de 30 dias, cifragem por usuário, direitos do titular e planos.
- Os dados do controlador ficam em `apps/web/src/lib/legal.ts`, junto com a versão.
- **A versão dos consentimentos de termos e privacidade passou para `2026-11-v2`**, a primeira com texto publicado. Quem aceitou a anterior aceita de novo no próximo acesso.
- Links na página inicial, nas telas de login e cadastro e na tela de consentimentos, que abre o texto em outra aba para não perder as marcações.

## Limitações conhecidas

- **Textos sem revisão jurídica.** A revisão não é viável agora. Antes de abrir para usuários reais, um advogado deve revisar os dois textos.
- **Controlador pessoa física** (preenchido em 2026-11-09). O CPF não é publicado: nome e e-mail de contato bastam. Ao abrir uma empresa, troque nome e CNPJ em `lib/legal.ts` e a versão dos textos.
- **A frase sobre treinamento de IA** só vale com um plano do provedor que não use os dados enviados. No plano gratuito do Gemini, isso não é verdade.
- **Exportar dados e excluir a conta** existem na API, mas não há tela: a política indica o e-mail para esses pedidos.
- A versão está em dois lugares (`lib/legal.ts` e `CURRENT_CONSENT_VERSIONS`), porque o front não importa o core. Mudar um exige mudar o outro.
