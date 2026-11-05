# ADR 0017 — Preferências calculadas a partir do feedback

- **Status:** Proposto
- **Data:** 2026-11-05
- **Decisores:** time LinkedIner

## Contexto

O modelo inicial previa uma tabela `user_preferences`, com pesos atualizados por uma tarefa na fila a cada avaliação. Isso mantém duas fontes da mesma informação, que podem divergir: desfazer uma avaliação exigiria desfazer também o que ela ensinou.

## Decisão

- **As preferências são calculadas na hora, a partir das avaliações.** Não há tabela de pesos nem fila. Mudar ou limpar uma avaliação já muda as recomendações.
- Cada avaliação guarda um retrato da vaga (empresa, nível, modelo de trabalho e termos dos requisitos), para o aprendizado continuar depois que a vaga for apagada.
- **As avaliações mudam a ordem, nunca o score de compatibilidade.** A lista usa um `rank_score` separado, e o ajuste é limitado a 15 pontos, para cima ou para baixo.
- **Regras v1:**
  - gostei e "mais vagas assim": cada termo da vaga vale +2;
  - tecnologia incompatível: cada termo vale -2;
  - muito sênior: -10 naquele nível e nos acima;
  - localização inadequada: -5 no mesmo modelo de trabalho;
  - empresa não desejada: todas as vagas dela somem da lista.
- Avaliação negativa ou "já me candidatei" tira a própria vaga da lista. A API informa quantas ficaram de fora.
- Só a avaliação da própria pessoa influencia as recomendações dela. Nenhum modelo é treinado.

## Limitações conhecidas

- "Salário incompatível" e "pouco alinhada" só escondem a vaga avaliada. Ainda não ensinam nada, porque faltam dados estruturados de salário e um sinal claro do que desalinhou.
- "Tecnologia incompatível" penaliza todos os termos da vaga, inclusive os que a pessoa não recusou. A interface poderia, no futuro, perguntar qual tecnologia.
- O cálculo percorre todas as vagas do usuário a cada consulta. Com vagas importadas à mão, o volume é pequeno. Fontes automáticas (Fase 6) devem exigir guardar o resultado.
