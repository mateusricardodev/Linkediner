# ADR 0021 — Limites por plano e pagamento com Stripe

- **Status:** Proposto
- **Data:** 2026-11-06
- **Decisores:** time LinkedIner

## Contexto

O ADR 0010 definiu planos como dados e o consumo como um registro somente de inserção. Aqui ficam as decisões de implementação.

## Decisão

- **Os módulos perguntam "posso gastar?", e não "qual é o plano?".** Eles conhecem só a porta `QuotaGate`, em `shared`, com `consume` e `refund`. Quem gasta não sabe qual é o plano.
- **Funcionalidade sem linha no plano não libera.** Faltar um dado nega o uso, em vez de liberar por engano.
- **Consumir é atômico:** um bloqueio por usuário e funcionalidade impede que dois pedidos passem do limite somando o mesmo saldo.
- **Só conta o que entregou.** A API consome ao aceitar o pedido, e o worker estorna quando o trabalho falha, com uma linha negativa. O estorno é único por consumo e cai no mês do consumo original.
- **O mês é o calendário em UTC**, igual para todos os planos.
- **Só o webhook muda a assinatura.** Voltar da página de pagamento não libera nada. O webhook confere a assinatura sobre o corpo original e ignora evento repetido, mais antigo ou de uma assinatura já substituída.
- **O cartão é digitado só na página da Stripe.** A aplicação guarda só os IDs do cliente e da assinatura.
- **`past_due` mantém o plano** enquanto a Stripe tenta cobrar. Outros status, como `canceled` e `unpaid`, voltam ao gratuito. O consumo do mês é mantido.
- **Sem a configuração da Stripe, o produto funciona só no plano gratuito.** As rotas de pagamento respondem 503.
- **Excluir a conta apaga o cliente na Stripe**, o que cancela a assinatura. Se isso falhar, ou se a Stripe não estiver configurada para quem tem assinatura, o pedido de exclusão fica aberto e é repetido.

### O que cada limite conta

| Funcionalidade | Conta quando |
|---|---|
| `profile.analysis` | Um documento é enviado para análise. Sem limite, o upload continua válido, e a análise pode ser pedida depois |
| `resume.improved` | Um currículo geral é gerado |
| `resume.tailored`, `cover_letter`, `form_answers` | Um material por vaga é gerado. Gerar de novo conta de novo |
| `job.match` | Uma vaga nova é importada. A compatibilidade usa só regras, mas a importação usa IA, e é ela que tem custo. O mesmo texto não conta duas vezes |
| `applications.assisted` | Uma candidatura é aprovada |
| `export.watermark` | Sim ou não, na hora de exportar. Não é contador |

`form_answers` é nova: não estava na tabela original. Os valores são os mesmos de `cover_letter`.

"Ilimitado" em `resume.improved` virou um teto de 500 por mês, para proteger o custo de IA.

## Consequências

- Importar vagas agora tem limite: 10 por mês no plano gratuito.
- As outras funcionalidades da tabela (`applications.auto`, `dashboard.full`, `sources.extra`, `apply_rules.advanced`, `monitoring.frequency_hours`, `github.deep_analysis`, `interview.simulation`) já têm limites gravados, mas nada as verifica, porque ainda não existem ou porque falta definir o que muda (`dashboard.full`).

## Limitações conhecidas

- Os valores dos limites são um ponto de partida, ainda sem validação comercial.
- Consumo e mudança de estado acontecem em transações separadas, e não na mesma como o ADR 0010 prevê. Uma queda entre os dois pode consumir sem entregar. O estorno cobre as falhas conhecidas, mas não a queda do processo.
- O plano Avançado e o Pro diferem hoje só nos limites, porque os recursos exclusivos ainda não existem. Vender o Avançado agora seria prometer o que não há.
- A Stripe não foi testada de ponta a ponta com uma conta real. Os testes conferem a assinatura do webhook e a tradução dos eventos, mas não uma cobrança.
