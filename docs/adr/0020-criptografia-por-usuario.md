# ADR 0020 — Criptografia por usuário, com as chaves fora do banco

- **Status:** Proposto
- **Data:** 2026-11-06
- **Decisores:** time LinkedIner

## Contexto

O ADR 0008 prevê uma chave por usuário para que os dados apagados fiquem ilegíveis nos backups. O modelo de dados previa guardar essa chave numa tabela `user_keys`.

Isso não cumpriria o objetivo. Um backup do banco teria os dados cifrados e a chave cifrada juntos, e a chave mestra continua existindo depois da exclusão. Quem tivesse o backup e a chave mestra leria tudo, mesmo depois de a chave ser "destruída" no banco ativo.

## Decisão

- **As chaves ficam num bucket só delas, fora dos backups do banco.** Esse bucket não pode ter versionamento nem regra de expiração. A aplicação recusa subir com o mesmo bucket dos documentos, que expira objetos em 30 dias.
- **Criptografia de envelope:** cada usuário tem uma chave AES-256 própria, guardada cifrada pela chave mestra (`DATA_MASTER_KEY`, fora do código e do banco).
- **Cada valor fica preso ao usuário e à coluna.** O AES-GCM autentica os dois. Um valor copiado para outra conta ou coluna, ou adulterado, não abre.
- **Campos cifrados:** `profile_facts.data` e `source_span`, `ai_generations.output`, `resumes.content`, `application_materials.content` e `applications.material_snapshot`.
- **A chave é buscada antes de abrir a transação**, para nenhuma chamada ao storage segurar uma conexão ou um bloqueio do banco. Ela fica em memória por até 5 minutos.
- **Criar a chave usa um bloqueio do Postgres**, válido entre a API e o worker. Sem isso, dois processos poderiam criar chaves diferentes, e o que foi cifrado com a perdedora se perderia.
- **Conta em exclusão nunca ganha chave nova**, o que desfaria a destruição da anterior.
- **No expurgo, a chave é destruída antes de o pedido ser concluído.** Se isso falhar, o pedido fica aberto e é repetido.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Tabela `user_keys` no banco | Os backups teriam a chave junto com os dados (ver Contexto) |
| Uma chave de KMS por usuário | Custo mensal por chave, inviável com contas gratuitas |
| Trocar a chave mestra periodicamente | Só ajudaria depois que os backups antigos já tivessem expirado |
| Cifrar o banco inteiro | Não permite destruir os dados de uma só pessoa |

## Consequências

- **Perder `DATA_MASTER_KEY` ou o bucket de chaves torna ilegíveis os dados cifrados de todos os usuários.** Os dois precisam de cópia segura, separada do banco. A cópia do bucket não pode durar mais que a retenção prevista para os backups, senão ela vira o mesmo problema da tabela.
- Campos cifrados não podem ser filtrados ou ordenados em SQL. Nenhuma consulta atual faz isso.
- Valores gravados antes desta mudança continuam legíveis, mas sem cifragem. Ainda não há usuários reais. Antes do beta, os ambientes precisam começar com o banco limpo.

## Limitações conhecidas

- **Nem tudo é cifrado.** E-mail e nome são usados no login. Links do perfil, objetivos de carreira, vagas importadas, scores e histórico das candidaturas também ficam em claro. Depois da exclusão, esses dados somem do banco ativo, mas seguem nos backups até expirarem (7 a 30 dias). A base legal disso precisa de orientação jurídica ([00 — B3](../arquitetura/00-descoberta.md)).
- `profile_facts.fingerprint` é um hash sem chave dos dados do fato, usado para evitar duplicatas. Um fato muito simples, como o nome de uma tecnologia, poderia ser descoberto por tentativa.
- **A chave mestra fica em variável de ambiente.** Um KMS seria mais seguro, e a troca é restrita a `FieldCipher`. Ainda não existe rotação dessa chave.
- O bucket de chaves precisa ser criado e configurado à mão em cada ambiente implantado.
