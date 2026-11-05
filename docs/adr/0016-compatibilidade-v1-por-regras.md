# ADR 0016 — Compatibilidade v1 só por regras, sem embeddings

- **Status:** Proposto
- **Data:** 2026-11-05
- **Decisores:** time LinkedIner

## Contexto

O ADR 0007 prevê combinar rubrica e similaridade de embeddings no score de compatibilidade. Sem o Gemini real, não há como validar a qualidade dos embeddings. Um número sem explicação clara também iria contra a exigência de um score explicável.

## Decisão

- A compatibilidade v1 compara os requisitos da vaga com os fatos comprovados do perfil, por palavra inteira e com uma lista de sinônimos de tecnologia. A IA não é chamada.
- **Pesos:** requisitos obrigatórios 60, desejáveis 15, nível 15, modelo de trabalho 10. Critério sem dados fica de fora, e o score é proporcional aos demais.
- **Vaga sem requisitos não recebe número**: `score` fica nulo.
- **Status de cada requisito:** atendido, parcial, não encontrado ou não verificável. "Não encontrado" descreve o perfil, não a pessoa, e a interface deve refletir isso.
- **Tempo de experiência pedido** ("5 anos com React") fica como parcial, porque o sistema não tem como confirmá-lo.
- **O nível compara a vaga com o objetivo declarado**, nunca com idade ou tempo de carreira.
- A empresa onde a pessoa trabalhou não comprova requisitos.

## Limitações conhecidas

- Requisitos genéricos, como "boas práticas de arquitetura", dificilmente batem por palavra e tendem a aparecer como não encontrados, o que reduz o score. Por isso os embeddings continuam no plano.
- Faixa salarial e local ainda não entram no cálculo: a vaga guarda o texto como foi escrito, sem valores estruturados.
- Os pesos são uma estimativa inicial, a calibrar no beta.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Embeddings desde a v1 | Sem validação possível, sem explicação por requisito e com custo por chamada |
| IA julga cada requisito | Instável entre execuções e contrária ao ADR 0007 |
