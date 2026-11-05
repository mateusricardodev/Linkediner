# 00 — Descoberta técnica (Fase 1)

## Estado atual do repositório

- Repositório `mateusricardodev/linkediner` criado vazio: sem commits, código, documentação ou decisões anteriores.
- Artefato existente fora do repositório: o design system e as telas iniciais no Figma ([arquivo](https://www.figma.com/design/FkC4mVIynAoY6T4IOguaQq)), com tokens (cores, tipografia, espaçamento), componentes e as telas Dashboard, Revisão da candidatura, Login e Upload de currículo.

## Restrições

### Do produto e do negócio
- Nenhuma candidatura sem aprovação do usuário.
- A IA não pode inventar informação. Conteúdo não comprovado deve aparecer como sugestão ou pendência.
- O score não pode ser apresentado como probabilidade de contratação, e não pode usar dados sensíveis (raça, gênero, idade, deficiência etc.).
- Sem promessa de "contratação garantida".

### Legais e de plataforma
- **LinkedIn:** o Contrato do Usuário e a política de softwares proibidos vetam scraping, bots e automação de atividades na plataforma. O acesso às APIs exige aprovação em programas específicos, que hoje não cobrem busca de vagas e candidatura por terceiros. Consequência: o LinkedIn entra como fonte de importação manual feita pelo próprio usuário, e como provedor de login (Sign In with LinkedIn via OpenID Connect).
- **LGPD e usuários internacionais:** consentimento, finalidade, retenção, exclusão, portabilidade e registro de operações.
- **Termos do Gemini:** pelos termos atuais do Gemini API, o conteúdo enviado no plano gratuito pode ser usado pelo Google para melhorar produtos. Isso é incompatível com documentos reais de usuários (ver [ADR 0004](../adr/0004-provedor-de-ia.md)). Verificar os termos vigentes antes do beta.

### Técnicas
- Linguagem: TypeScript.
- Não depender de forma irreversível do Gemini nem de nenhuma fonte de vagas.
- Não guardar senhas de contas externas.
- Não registrar dados pessoais em logs.

### Do ambiente de design
- O Figma está no plano Starter: 1 modo de variáveis (sem tema escuro), 3 páginas e um limite baixo de chamadas da integração com o Claude. Os tokens devem ter fonte da verdade no repositório (ver [ADR 0011](../adr/0011-design-tokens.md)).

## Dúvidas

### Bloqueadoras (mudam a arquitetura ou o cronograma)

| # | Pergunta | Por que bloqueia | Bloqueia a partir de |
|---|---|---|---|
| B1 | Quando o projeto passa para um plano pago de IA (Gemini pago ou outro provedor com garantia de não usar os dados para treino)? | Sem isso, não é possível processar currículos reais de usuários. | Beta com usuários reais |
| B2 | Qual será a primeira fonte **autorizada** e testável para candidatura automática? Há empresa parceira usando Greenhouse ou Lever disposta a fornecer chave de API? | As APIs de candidatura de Greenhouse e Lever exigem a chave do empregador. Sem um parceiro, a automação real não tem onde rodar. | Fase de automação (pós-MVP) |
| B3 | Haverá orientação jurídica para LGPD, termos de uso e política de privacidade antes do beta? | Define textos de consentimento, base legal e o processo de exclusão. | Beta com usuários reais |

### Não bloqueadoras (decididas com uma premissa razoável, documentada)

| Dúvida | Decisão provisória |
|---|---|
| Provedor de pagamento | Interface `PaymentProvider`. Primeira implementação: Stripe (cobre cobrança internacional). Pix e Mercado Pago ficam para depois. |
| Hospedagem | Containers sem dependência de plataforma. Sugestão para o MVP: Postgres gerenciado (Supabase ou Neon) + R2/S3 + um PaaS de containers. |
| Idioma | pt-BR na primeira versão, com estrutura de i18n desde o início. |
| Analytics de produto | Eventos próprios no Postgres no MVP. Ferramenta externa só depois, e sem PII. |
