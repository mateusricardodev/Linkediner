# ADR 0018 — Material por vaga conferido contra os fatos

- **Status:** Proposto
- **Data:** 2026-11-06
- **Decisores:** time LinkedIner

## Contexto

Até o M-12, a candidatura usava só um currículo geral já aprovado. O produto também promete currículo adaptado à vaga, carta de apresentação e respostas de formulário. Esse material é o ponto de maior risco de invenção: a vaga traz requisitos, e o modelo tende a afirmar que a pessoa os tem.

## Decisão

- **Um material por tipo em cada candidatura** (`application_materials`). Gerar de novo substitui o anterior. Pedir de novo durante a geração devolve o pedido em andamento.
- **A vaga orienta, os fatos comprovam.** A IA recebe os fatos (sem os trechos do documento) e título, empresa e requisitos da vaga (sem o texto bruto). A conferência usa só os fatos citados.
- **Cargo e empresa da vaga podem ser citados por inteiro, mas não comprovam nada.** A menção exata é ignorada na conferência. Uma vaga de "Dev React" não torna verdadeira a frase "tenho experiência com React", que vira sugestão.
- **Pergunta sem base fica sem resposta.** A resposta nula é explícita, para a pessoa responder por conta própria. O código ignora resposta a uma pergunta inexistente.
- **Nada segue para aprovação com sugestão pendente** ou com geração em andamento. A pessoa confirma, corrige ou remove cada frase.
- **O material só muda em revisão.** Da aprovação em diante, ele fica congelado. O currículo adaptado tem prioridade sobre o currículo geral escolhido, e o resultado é copiado para a candidatura na aprovação.
- **Só confirmação no currículo vira fato.** Carta e respostas são textos para uma vaga específica, e a confirmação não entra no perfil.
- **Candidatura enviada tira a vaga das recomendações**, sem precisar da avaliação "já me candidatei". A API conta essa vaga em `hidden`. Salvar uma vaga não a esconde.

## Consequências

- Três prompts novos e versionados: `tailor_resume`, `cover_letter` e `form_answers`.
- O conteúdo do material fica em `jsonb`, e o tipo define o formato. Cada geração é registrada em `ai_generations`, e a auditoria guarda só contagens.
- O limite de material por plano entra com os planos (M-14).

## Limitações conhecidas

- A conferência acha números, nomes próprios e tecnologias conhecidas. Afirmações genéricas ("tenho forte liderança") passam se citarem um fato. A pessoa continua sendo a última revisão.
- Carta e respostas aprovadas ainda não têm download. A pessoa copia o texto pela interface.
