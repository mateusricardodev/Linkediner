# ADR 0012 — Extração só com texto verificável

- **Status:** Proposto
- **Data:** 2026-11-05
- **Decisores:** time LinkedIner

## Contexto

A arquitetura inicial previa três coisas na extração de currículos (M-05):

1. enviar PDFs escaneados direto ao modelo multimodal;
2. guardar o texto extraído criptografado no banco;
3. usar um parser dedicado para o PDF do LinkedIn antes da IA.

Ao implementar, a primeira colide com duas regras obrigatórias do produto: remover dados sensíveis antes de enviar à IA e comprovar cada fato contra o documento. Sem texto, nenhuma das duas é possível. A segunda guarda uma cópia do currículo que nada usa hoje.

## Decisão

- **PDF sem texto selecionável falha** com o código `no_text`, sem chamar a IA. O usuário é orientado a enviar outra versão. Se a demanda aparecer, entra um OCR próprio atrás da porta `TextExtractor`, de modo que o texto continue passando pela remoção de dados sensíveis e pela verificação.
- **O texto extraído não é guardado.** Ele existe só durante o processamento. Reprocessar lê o arquivo de novo, enquanto ele existir. O trecho que comprova cada fato (`source_span`) é apagado quando o documento expira.
- **O PDF do LinkedIn usa o mesmo caminho do currículo** nesta versão, sem parser dedicado. O parser fica para quando houver PDFs reais para avaliar a qualidade da extração.

## Pendência conhecida

O ADR 0008 prevê cifrar as saídas de IA com a chave de cada usuário. `ai_generations.output` e `profile_facts.data` contêm dados profissionais e, por enquanto, têm só a criptografia em repouso do provedor do banco. Eles são apagados em cascata com a conta. A cifragem por usuário entra com o crypto-shredding (M-13) e **precisa estar pronta antes do beta com usuários reais**.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Multimodal para PDFs escaneados | Envia ao provedor o documento inteiro, com foto e dados pessoais, e a resposta não pode ser conferida |
| Guardar o texto extraído cifrado | Mais um lugar com dados pessoais, sem uso nesta etapa |

## Consequências

- Positivas: a regra anti-invenção e a remoção de dados sensíveis valem para 100% dos documentos processados; menos dados pessoais guardados.
- Negativas: currículos escaneados não são aceitos por enquanto; reprocessar depois da expiração exige novo upload.
