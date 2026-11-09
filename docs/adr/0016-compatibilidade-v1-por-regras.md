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

## Atualização (2026-11-07): rubrica v2

Com vagas reais, a v1 dava notas sem sentido: 0 a 23 para uma pessoa com a stack pedida. Ela foi testada com tópicos curtos, mas vagas reais escrevem frases, e a regra exigia metade das palavras do requisito, inclusive "proficiency" ou "wide". Requisitos como "excelente comunicação" contavam como lacuna, embora nada consiga verificá-los.

- **Tópico curto, de até 3 termos, segue como antes.**
- **Em frases, só contam tecnologias conhecidas e nomes próprios no meio da frase.** A lista está no código, e nomes ambíguos, como Go e Rest, dependem da maiúscula.
- **Frase sem nada comparável fica "não verificável"** e não conta contra nem a favor.
- **Quando a frase oferece opções ou dá exemplos** ("AWS, Azure ou GCP"), um termo basta. Sem isso, faltar um termo deixa o requisito como parcial.
- **O tempo de experiência continua deixando como parcial.**

**Limites:** a lista de tecnologias precisa de manutenção. Uma ferramenta desconhecida, escrita em minúsculas, é ignorada. Uma palavra comum com maiúscula no meio da frase conta como nome e pode aparecer como não encontrada. A nota compara o que está escrito: ter a palavra no perfil não comprova domínio.
