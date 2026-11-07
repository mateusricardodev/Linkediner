# ADR 0024 — Vagas automáticas por um catálogo de fontes públicas

- **Status:** Proposto
- **Data:** 2026-11-07
- **Decisores:** time LinkedIner

## Contexto

Colar vaga por vaga não é o produto desejado: as vagas precisam aparecer de acordo com o perfil, com foco em tecnologia e nas mais recentes. O ADR 0015 deixou cada vaga pertencendo a quem importou, e previu um modelo compartilhado para esta fase. O ADR 0006 proíbe scraping e fontes sem autorização clara.

**Medição em 2026-11-07:** dos 150 nomes de empresas testados nas listagens públicas de Greenhouse e Lever, 57 têm vagas abertas, e 34 têm vagas no Brasil ou remotas na América Latina: 1.268 no Brasil, 224 publicadas nos últimos 7 dias, sem filtrar por área. Nubank e iFood não apareceram com esses nomes. A identidade de cada empresa escolhida foi conferida.

**O que os termos dizem, até onde foi possível ler:** a documentação do [Greenhouse](https://docs.greenhouse.io/job-board.html) diz que os dados são públicos e dispensam autenticação. A do [Lever](https://github.com/lever/postings-api) diz que as vagas publicadas são públicas e "podem ser coletadas por terceiros". **Nenhuma autoriza expressamente republicar vagas num agregador**, e os termos de cada empresa podem restringir. Isso precisa de orientação jurídica antes de usuários reais (dúvida B3).

## Decisão

- **Catálogo global de vagas públicas (`external_jobs`), separado das vagas de cada pessoa.** Não guarda dado de ninguém. A aplicação só lê, e quem escreve é o worker.
- **As fontes começam desligadas.** Só `job_sources.status = 'active'` faz chamadas e mostra vagas. Em produção, ligar exige registrar a revisão dos termos em `terms_reviewed_at`. Desligar tira as vagas da tela na hora.
- **Só o necessário é copiado:** vagas de tecnologia, no Brasil ou remotas na América Latina. Vaga que some da listagem da empresa sai do catálogo.
- **A tela aponta para a origem:** título, empresa, local, data e link para a vaga original. O texto completo só aparece depois que a pessoa salva a vaga.
- **Seu perfil não sai daqui.** A busca usa dados públicos, e a comparação com o objetivo e com os fatos roda no nosso código. A IA recebe só o texto público da vaga, sem contatos de recrutadores, e não exige o consentimento de IA.
- **Uma análise por vaga, para todo mundo**, feita pelo worker e só para vagas que interessam a algum objetivo ativo, com teto de 40 a cada 30 minutos. Modelo e versão do prompt ficam registrados na própria vaga. Texto alterado na fonte pede uma análise nova.
- **Salvar copia a vaga para as da pessoa** (`jobs`), já analisada, com referência à origem. A partir daí, compatibilidade, avaliação e candidatura funcionam sem mudança, e a cópia continua existindo se a vaga sair do ar.
- **A ordem é por recência**, que é o foco pedido. A nota aparece ao lado. Empresa bloqueada pela pessoa não volta.
- **Filtro por objetivo:** cargos, ou o nome do objetivo sem nível nem formato, em português ou inglês; locais; e "só remoto". O filtro decide o que aparece, e o número continua vindo das regras de compatibilidade (ADR 0016).

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Criar uma vaga em `jobs` para cada pessoa, a cada sincronização | Custo de IA multiplicado pelo número de pessoas, e milhares de linhas que ninguém abriu |
| Mandar perfil ou objetivo para a IA escolher as vagas | Dado pessoal saindo sem necessidade, e resultado sem explicação |
| Coletores de LinkedIn, Gupy ou Indeed | Proibido ou sem autorização (ADR 0006) |
| Agregadores pagos, como Adzuna | Só trazem um trecho da descrição, e o uso comercial exige licença. Pode ser avaliado depois |

## Limitações conhecidas

- **Não é o mercado inteiro.** A lista é de 33 empresas, com tendência a vagas de tecnologia e de quem usa Greenhouse ou Lever. A tela diz isso.
- **"Vagas escondidas" não são garantidas.** Estas vagas vêm direto do sistema da empresa, mas não há como saber se também estão no LinkedIn.
- **Filtro por palavras:** um cargo com nome incomum pode ficar de fora, e uma vaga em local ambíguo pode entrar.
- **O plano ainda não limita isto.** A tabela do doc 09 reserva o monitoramento (`monitoring.frequency_hours`) para os planos pagos, mas ele está aberto a todos durante a validação. É uma decisão de negócio pendente.
- **Consulta sem cache por pessoa:** cada abertura calcula a nota em memória. Serve para o volume atual, e deve ser revisto com muitos usuários.
- **Prazo de análise:** uma vaga nova pode levar até 6 horas para aparecer, e mais 30 minutos para ter nota. Com muitas vagas pendentes, o teto alonga a fila.

## Consequências

- Positivas: vagas aparecem sem colar nada; nenhum dado pessoal novo sai do sistema; o custo de IA não cresce com o número de pessoas; o fluxo de candidatura não muda.
- Negativas: uma dependência nova de fontes externas, que podem mudar sem aviso, e mais uma revisão jurídica antes do beta.
