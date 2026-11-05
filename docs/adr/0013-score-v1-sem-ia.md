# ADR 0013 — Score do perfil v1 sem chamada de IA

- **Status:** Proposto
- **Data:** 2026-11-05
- **Decisores:** time LinkedIner

## Contexto

O ADR 0007 prevê que a IA extraia sinais para a rubrica e escreva os textos explicativos do score. Ao implementar o M-06, tudo o que a rubrica v1 usa já está disponível sem nova chamada de IA: os fatos comprovados da extração (M-05), os links, o título, o resumo e os objetivos.

## Decisão

- A rubrica v1 calcula os pontos e gera os textos **em código**, a partir de modelos fixos. A IA não é chamada.
- Métricas de resultado são detectadas por regra: um número na descrição que não seja um ano.
- Só contam fatos `extracted` ou `user_confirmed`. Datas contam pela presença, nunca pelo valor, e anos de experiência não entram: assim a idade não influencia o score.
- O score é calculado na leitura e depois de cada extração. Uma nova linha de histórico só é gravada quando o resultado muda.
- A decisão do ADR 0007 continua valendo para o que vier depois: textos personalizados com IA podem entrar numa rubrica futura, sempre citando os fatos.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| IA escreve os textos desde a v1 | Custo e risco de invenção sem ganho claro agora, e o Gemini real ainda não foi validado |
| Fila própria `profile.score` | O cálculo é rápido e determinístico: uma fila só adicionaria pontos de falha |
| Recalcular em cada alteração do perfil | Exige lembrar de chamar em cada rota. Calcular na leitura nunca fica desatualizado |

## Consequências

- Positivas: score estável, sem custo, sem envio de dados ao provedor e sem exigir o consentimento de IA.
- Negativas: recomendações genéricas, não personalizadas. A detecção de métricas por regra é simples. O histórico só registra mudanças quando o score é lido ou uma extração termina, então a evolução tem a precisão desses momentos. Os pesos são uma estimativa inicial, a calibrar com usuários do beta.
