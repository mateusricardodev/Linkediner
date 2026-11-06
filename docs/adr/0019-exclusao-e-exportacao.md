# ADR 0019 — Exclusão da conta e exportação de dados

- **Status:** Proposto
- **Data:** 2026-11-06
- **Decisores:** time LinkedIner

## Contexto

A LGPD garante à pessoa apagar a conta e levar os próprios dados. O ADR 0008 definiu o objetivo. Aqui ficam as decisões de implementação. A criptografia com uma chave por usuário, que torna os backups ilegíveis, entra em um PR separado.

## Decisão

### Exclusão

- **Confirmação:** a pessoa digita o próprio e-mail e precisa ter feito login há menos de 1 hora. Uma sessão roubada ou esquecida aberta não basta.
- **Efeito imediato:** numa transação, a conta vai para `pending_deletion` e todas as sessões são encerradas. Enquanto o expurgo não termina, o login é recusado.
- **Expurgo em etapas repetíveis:** cancela as tarefas na fila, apaga os arquivos por prefixo e, numa única transação, pseudonimiza a auditoria, apaga o usuário (o banco apaga o resto em cascata) e conclui o pedido. Os arquivos saem antes do banco para que uma nova tentativa ainda saiba de quem é o prefixo.
- **A exclusão não depende da fila:** o pedido é gravado antes de ir para a fila, e uma tarefa a cada 15 minutos retoma o que ficou parado ou falhou.
- **O que sobra:** em `deletion_requests`, o pseudônimo e contagens. Na auditoria, o pseudônimo. O e-mail fica livre para uma nova conta.
- Exclusão e exportação exigem só o login: quem revogou os termos também pode sair e levar os dados.

### Exportação

- O worker gera um ZIP com `dados.json` (por tabela) e os arquivos enviados que ainda não expiraram. O arquivo expira em 7 dias.
- **A URL de download vale 5 minutos e é gerada a cada consulta**, não 7 dias como previsto em F9. Um link vazado perde a validade logo. Pedir e baixar exigem login recente.
- **Ficam de fora:** hash de senha, tokens, sessões e caminhos internos do storage. Das identidades de login, sai só o provedor.
- **Toda tabela nova com `user_id` precisa ser classificada:** um teste compara o banco com a lista de tabelas exportadas e falha se alguma não estiver nela. Outro teste confere que a exclusão zera todas essas tabelas.

## Consequências

- Se a conta for excluída durante uma exportação, o arquivo gerado é apagado.
- Uma tarefa em execução no momento do expurgo termina sozinha: sem o usuário, a chave estrangeira impede gravar dado órfão.
- **Requisito de implantação:** `users` tem RLS com `FORCE`, e o login, o expurgo e as tarefas diárias usam o papel dono do banco sem contexto de usuário. Esse papel precisa de `BYPASSRLS` (ou ser superusuário). Sem isso, o login e a exclusão não funcionam em produção.

## Limitações conhecidas

- **Backups:** até a criptografia por usuário entrar, os dados apagados continuam legíveis nos backups até eles expirarem (7 a 30 dias). Isso precisa estar resolvido antes do beta com usuários reais.
- **Confirmação por e-mail (F8):** ainda não existe serviço de e-mail. A pessoa vê a confirmação só na resposta da API.
- **Assinatura:** o cancelamento no provedor de pagamento entra com os planos (M-14).
- **Upload em andamento:** uma URL de upload emitida antes da exclusão pode gravar um arquivo depois do expurgo. Ela expira em minutos, e o arquivo some pela regra de ciclo de vida de 30 dias do bucket.
- **ZIP em memória:** o volume é pequeno com os limites atuais de upload e a retenção de 30 dias.
