# ADR 0037 — Vagas do dia

- **Status:** Proposto
- **Data:** 2026-11-24
- **Decisores:** time LinkedIner

## Contexto

O usuário pediu que, todo dia, o LinkedIner mostre as 3 a 5 vagas mais compatíveis com o perfil, com a porcentagem, o link e um currículo por vaga — no estilo do digest por e-mail que um amigo dele recebe. Primeiro testamos no web; o e-mail fica para depois (o projeto não envia e-mail).

Decisões já tomadas (ver a memória "Vagas do dia" e o ADR 0031):

- **Fontes:** só o catálogo das fontes gratuitas (Himalayas e Jobicy, ADR 0031). A busca paga na web pelo Gemini foi recusada.
- **Nunca o LinkedIn:** sem abrir páginas do LinkedIn (ADR 0006).
- **Currículo por vaga:** sai como rascunho a revisar (ADR 0018), aproveitando o aprendizado das correções (ADR 0030).

## Decisão

- **Sem IA nova na seleção.** As vagas do dia reaproveitam a descoberta (ADR 0024): a compatibilidade é calculada com dados que já temos, sem chamar a IA e sem enviar nada para fora. O `DiscoveryService` passou a expor `collect`, que reúne e pontua as candidatas; o feed ordena por recência e as vagas do dia ordenam pela maior compatibilidade.
- **Seleção fixa no dia (snapshot).** Na primeira visita do dia, escolhemos as até 5 mais compatíveis e guardamos em `daily_job_picks` (uma linha por usuário por dia). Nas visitas seguintes, devolvemos o que foi guardado, para a lista não mudar durante o dia. Um dia sem vaga não é guardado, para que uma sincronização mais tarde ainda possa preencher o dia.
  - **Por que na visita, e não num cron:** evita uma tarefa agendada sobre todos os usuários enquanto testamos no web. O snapshot guardado já deixa o caminho pronto para o e-mail: um agendamento futuro só precisa pré-calcular a mesma seleção.
- **Guardado com cifra.** O snapshot traz o título, a empresa, o link, a data e a nota de cada vaga. Como a nota revela o quanto o perfil combina, a coluna `items` é criptografada por usuário (ADR 0020) e entra na exportação da conta (LGPD).
- **Mesmo gate da descoberta.** As vagas do dia são dos planos pagos e exigem um objetivo de carreira. Sem fonte ligada, a seção não aparece. No plano gratuito, mostramos um convite para conhecer os planos.
- **Tela:** uma seção "Vagas do dia" no topo da coluna central do Início, com a nota, o link para a vaga original e um botão "Gerar currículo" por vaga. O botão salva a vaga entre as da pessoa e abre o gerador (ADR 0036) já com a vaga escolhida (`/curriculo?job=…`).
- **Rota:** `GET /v1/discovery/today`, com os mesmos estados da descoberta (`disabled`, `upgrade_required`, `needs_goal`, `ready`).

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Seleção ao vivo (top 5 do feed a cada visita) | A lista mudaria durante o dia e não serviria para o e-mail. O pedido é "as vagas do dia", fixas |
| Cron diário sobre todos os usuários agora | Peso desnecessário enquanto testamos no web. O snapshot na visita já fixa o dia e prepara o e-mail |
| Gerar o currículo direto da lista, sem passar pelo assistente | Puparia a escolha de idioma e a conferência dos dados (ADR 0036). O botão leva ao assistente com a vaga pronta |
| Busca paga na web pelo Gemini | Recusada pelo custo (ADR 0031). Ficamos no catálogo gratuito |

## Consequências

- **Fixo no dia, por usuário.** Trocar o objetivo no mesmo dia não muda a seleção já guardada; vale a partir do dia seguinte. O dia é o UTC.
- **Limite do plano:** salvar uma vaga do dia para gerar o currículo copia a vaga, como na descoberta, e segue os limites de `job.match` e de geração do plano.
- **Pronto para o e-mail:** o snapshot guardado é o que um envio futuro usaria, sem recalcular.
