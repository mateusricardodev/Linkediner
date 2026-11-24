# ADR 0033 — Modelos de reserva quando o Gemini está sobrecarregado

- **Status:** Proposto
- **Data:** 2026-11-24
- **Decisores:** time LinkedIner

## Contexto

Em 2026-11-24, o `gemini-3.5-flash-lite` do plano gratuito passou vários períodos de 5 a 10 minutos respondendo 503 (sobrecarga). A extração do PDF do LinkedIn falhou mesmo com as novas tentativas espaçadas, porque todas caíram dentro da mesma queda. Nos mesmos minutos, outros modelos do Gemini respondiam: a sobrecarga é por modelo, e muda de minuto a minuto.

Sondagem com a chave do projeto, no mesmo dia: os modelos "pro" e os `gemini-4` não têm cota gratuita (429). Os `gemini-3.5` a `3.8-flash` têm, mas alternam entre responder e dar 503, e às vezes levam de 30 a 80 segundos.

## Decisão

- **`AI_MODEL_FALLBACK`**: lista de modelos, separados por vírgula, do mais potente ao mais leve. Ficou `gemini-3.8-flash, 3.7-flash, 3.6-flash, 3.5-flash` e, por último, `gemini-flash-lite-latest`, o mais disponível.
- **Só sobrecarga troca de modelo**: 429, 500, 503 e 504. Erro do próprio pedido (400, esquema) sobe na hora.
- **Limite de 150 segundos** para tentar reservas: depois disso, a falha volta para a fila, que tenta de novo mais tarde (5 minutos de prazo por tentativa).
- O modelo que respondeu fica registrado em `ai_generations.model`.

## Consequências

- O modelo principal continua o mesmo, e a avaliação (ai-evals) continua medindo só ele. As reservas ainda não passaram pela avaliação: a qualidade da extração pode variar quando uma delas responde.
- Nomes de modelo mudam: a lista fica no `.env`, sem valor padrão no código.
- Em produção, no plano pago (ADR 0004), a sobrecarga é rara, mas a reserva continua útil.
