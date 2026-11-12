# ADR 0031 — Portais de vagas remotas: Himalayas e Jobicy

- **Status:** Proposto
- **Data:** 2026-11-12
- **Decisores:** time LinkedIner

## Contexto

A próxima funcionalidade é a de "vagas do dia": todo dia, as 3 a 5 vagas mais compatíveis com o perfil, com a nota, o link e um currículo para cada uma. O catálogo (ADR 0024 e ADR 0026) tem poucas empresas e pode não render vagas novas boas todos os dias.

A busca na web pela IA (Gemini com Google Search) foi testada em 2026-11-12: a chave atual, no nível gratuito, não tem cota para a busca, e o usuário decidiu não pagar nesta fase. LinkedIn, Glassdoor e Indeed continuam proibidos (ADR 0006). Gupy e Jobether não têm acesso público.

**Medição em 2026-11-12**, com os adaptadores contra as fontes reais, sem gravar nada:

| Fonte | Termos da API | Vagas de tecnologia abertas ao Brasil |
|---|---|---|
| Himalayas | Gratuita. Permite mostrar em outro app sem pedir, com crédito visível e candidatura pelo `applicationLink` | 4 buscas, 279 recebidas, quase todas da última semana |
| Jobicy | Gratuita. Pede crédito com link e candidatura pelo endereço da vaga | 44 |
| RemoteOK | Gratuita, com link de volta | 2, nenhuma da semana, com texto corrompido: ficou de fora |
| Remotive | Proíbe mostrar as vagas em troca de cadastro: o LinkedIner exige login | Ficou de fora |
| Arbeitnow | Gratuita | Nenhuma: só Europa |

Juntas, Himalayas e Jobicy somaram 255 vagas únicas depois do filtro do catálogo.

## Decisão

- **Dois adaptadores novos**, `himalayas` e `jobicy`, no formato dos anteriores. Fontes e listagens ficam em dados (migração 0040), **desligadas**.
- **O token muda de sentido nos portais.** No Himalayas, é a palavra buscada (`developer`, `engineer`, `data`, `devops`), com até 5 páginas de 20 vagas por busca, as mais recentes primeiro. No Jobicy, é a região (`brazil`), e a API já devolve só vagas abertas a ela.
- **Só vaga que aceita quem está no Brasil.** No Himalayas, o Brasil precisa estar na lista de países: vaga sem restrição fica de fora, porque muitas são, na prática, só para os EUA. Vaga expirada também fica de fora.
- **O local diz a abrangência:** "Remoto, Brasil" quando só o Brasil é aceito, "Remoto, inclui Brasil" quando há outros países, ou a região informada pela fonte ("Remoto, LATAM, Canada, USA"). O filtro do catálogo (`isRelevantPosting`) não mudou.
- **Cada vaga traz a própria empresa**, como nos repositórios do GitHub. A mesma vaga em duas buscas ou nas duas fontes aparece uma vez, pela regra do ADR 0026.
- **O crédito tem link.** Na lista, "via Himalayas" e "via Jobicy" levam ao site da fonte, e "Abrir vaga original" usa o link de candidatura que a fonte entrega, sem alteração.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Busca na web pela IA | Exige pagar a busca, e o custo cresce com o número de pessoas. Pode voltar depois, para completar o dia |
| Remotive | Os termos proíbem mostrar as vagas atrás de um cadastro |
| RemoteOK | Quase nenhuma vaga aberta ao Brasil |

## Limitações conhecidas

- **Quase tudo é vaga remota de empresa estrangeira, em inglês.** O currículo por vaga sai em inglês quando a vaga pede (ADR 0029). Vagas presenciais e de empresas brasileiras continuam dependendo do catálogo e da importação manual.
- **Mais vagas para analisar.** Cada vaga que interessa a algum objetivo passa uma vez pela IA, com o teto de 40 a cada 30 minutos (ADR 0024). Com centenas de vagas novas, a fila leva algumas horas.
- **Os termos dos portais podem mudar sem aviso**, e o Himalayas limita chamadas sem chave. Como as outras fontes, precisam de revisão jurídica antes de usuários reais.
