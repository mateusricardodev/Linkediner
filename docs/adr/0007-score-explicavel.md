# ADR 0007 — Score explicável: a IA extrai sinais e uma rubrica determinística pontua

- **Status:** Proposto
- **Data:** 2026-11-05
- **Decisores:** time LinkedIner

## Contexto

O score de perfil e o de compatibilidade precisam ser explicáveis, auditáveis, livres de atributos sensíveis e nunca apresentados como probabilidade de contratação. Pedir o número diretamente a um LLM gera resultados instáveis e difíceis de justificar.

## Decisão

- A IA extrai fatos e sinais objetivos (por exemplo: "experiência tem métrica de resultado", "tecnologia X exigida e presente").
- Uma rubrica em código, versionada (`rubric_version`), aplica pesos e calcula de 0 a 100. Cada ponto é atribuído a um critério.
- A compatibilidade combina rubrica (requisitos) e similaridade de embeddings. O ranking pessoal (`rank_score`) aplica as preferências aprendidas por cima.
- A IA só escreve os textos explicativos, citando os fatos.
- Atributos sensíveis e proxies óbvios ficam fora da entrada e da rubrica.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| LLM devolve o score diretamente | Instável entre execuções, difícil de explicar e de auditar viés |
| Modelo de ML treinado | Sem dados nem consentimento para isso no MVP |

## Consequências

- Positivas: score estável, explicável e testável. Mudanças de critério ficam versionadas e comparáveis.
- Negativas: a rubrica precisa de calibração manual. Revisar com usuários do beta.
