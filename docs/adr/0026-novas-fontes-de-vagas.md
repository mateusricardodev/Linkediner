# ADR 0026 — Novas fontes de vagas: Ashby, SmartRecruiters e comunidades no GitHub

- **Status:** Proposto
- **Data:** 2026-11-09
- **Decisores:** time LinkedIner

## Contexto

O usuário quer vagas recém-publicadas e vagas divulgadas fora da área de vagas do LinkedIn, como posts "Estamos contratando". Coletar o LinkedIn é proibido (ADR 0006). Os caminhos permitidos escolhidos foram mais sistemas de candidatura com listagem pública e os repositórios em que comunidades brasileiras publicam vagas como issues.

**Medição em 2026-11-09**, com os adaptadores novos contra as fontes reais, sem gravar nada:

| Fonte | O que foi testado | O que entra no catálogo |
|---|---|---|
| Ashby | Cerca de 280 nomes de empresas | Nubank (19), OpenAI (5), Oyster (3) e Belvo (1) |
| SmartRecruiters | Cerca de 170 nomes | Experian/Serasa (75) e Wise (9) |
| Workable | Cerca de 120 nomes | Nenhuma empresa com vagas no Brasil: a fonte não foi incluída |
| GitHub | 20 repositórios de vagas | 8 ativos, com 65 vagas de tecnologia abertas nos últimos 90 dias |

Ao todo, 177 vagas, 24 publicadas na última semana. O Nubank, que não aparecia no Greenhouse nem no Lever, está no Ashby.

**Termos:** a [API pública do Ashby](https://developers.ashbyhq.com/docs/public-job-posting-api) e a [Posting API do SmartRecruiters](https://developers.smartrecruiters.com/docs/posting-api) existem para publicar as vagas em outros sites. A API do GitHub é pública, mas cada issue é conteúdo de quem a escreveu, e cada repositório tem as próprias regras. Como no ADR 0024, nenhuma autoriza expressamente um agregador comercial: **as fontes começam desligadas e precisam de revisão jurídica.**

## Decisão

- **Três adaptadores novos**, no mesmo formato dos anteriores: `ashby`, `smartrecruiters` e `github`. Fontes e listagens ficam em dados (migração 0035), desligadas.
- **SmartRecruiters:** a lista vem filtrada por país (Brasil) e não traz a descrição. A descrição é buscada uma a uma, **só para as vagas que passam no filtro do catálogo**, com teto de 5 páginas por empresa. A Experian tem 188 vagas no Brasil e 75 de tecnologia: são 75 chamadas, não 188.
- **GitHub:** cada issue aberta é uma vaga. Ficam de fora pull requests, issues com mais de 90 dias e as marcadas como esquecidas (`stale`, "fechada"). O link aponta para a issue.
- **Empresa e local vêm do título** ("[Remoto] Cargo - Empresa", "Cargo na Empresa", "Empresa - Cargo"). Sem um desses padrões, a vaga aparece como "Empresa não informada", em vez de um palpite. O que vem depois de "|" não vira empresa, porque costuma ser formato, salário ou recrutadora. "Confidencial" também não. Os repositórios são brasileiros: sem outro país no local, a vaga é marcada como no Brasil.
- **A vaga pode trazer a própria empresa** (`ExternalPosting.company`). Nas listagens por empresa, continua valendo a empresa da listagem.
- **Markdown vira texto** antes de ir para o catálogo, e os endereços dos links saem: contato de recrutador não vai para a análise. A redação de e-mail e telefone continua antes da IA (ADR 0024).
- **A mesma vaga em duas comunidades aparece uma vez** na lista da pessoa, pela publicação mais recente, comparando título e empresa.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Ler posts do LinkedIn ou uma extensão de navegador | Proibido pelos termos do LinkedIn, ou zona cinzenta (ADR 0006). O usuário escolheu não seguir esse caminho |
| Workable | Nenhuma empresa testada tem vagas no Brasil. O adaptador pode entrar quando houver uma |
| IA para descobrir a empresa das issues | A empresa adivinhada pelo título já estaria no texto, e a IA tenderia a repeti-la. O ganho não justificou a complexidade |
| Buscar a descrição de todas as vagas do SmartRecruiters | Centenas de chamadas a cada rodada para vagas que o filtro descarta |

## Limitações conhecidas

- **Empresa pelo título pode sair errada** em formatos incomuns, como "Cargo - Especialização" ("Analista de Dados - Visão Computacional"). A pessoa vê o link da issue antes de salvar.
- **Vagas de comunidade não têm verificação.** Qualquer pessoa pode abrir uma issue, e a qualidade varia. Alguns repositórios marcam vagas como "verificada", e isso ainda não é usado.
- **Limite do GitHub sem chave:** 60 chamadas por hora. Com 8 repositórios a cada 6 horas, sobra folga. Mais repositórios podem exigir um token.
- **A lista do Ashby e do SmartRecruiters é curta.** As empresas foram encontradas testando nomes, não por busca: outras podem existir.
