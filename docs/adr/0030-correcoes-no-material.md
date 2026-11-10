# ADR 0030 — Material por vaga aprende com as correções

- **Status:** Proposto
- **Data:** 2026-11-09
- **Decisores:** time LinkedIner

## Contexto

O ADR 0025 fez o currículo geral aprender com o que a pessoa corrige e remove. O material por vaga (currículo adaptado, carta e respostas de formulário, ADR 0018) ainda não aprendia: cada geração começava do zero, e gerar de novo apagava o conteúdo, junto com as correções.

## Decisão

- **Ao corrigir uma frase do material, o texto gerado fica guardado nela** (`originalText`), como no currículo.
- **Gerar de novo guarda as correções da versão anterior** em `application_materials.corrections`, cifradas com a chave da pessoa como o conteúdo (ADR 0020), antes de limpar o conteúdo. Sem isso, o caso mais comum, que é corrigir e pedir outra versão, perderia o que a pessoa ensinou.
- **A geração recebe até 10 frases corrigidas e 10 removidas**, das mais recentes para as mais antigas:
  1. as correções da versão anterior deste material;
  2. as de outros materiais do mesmo tipo, em outras candidaturas, tanto da versão atual quanto das anteriores;
  3. no currículo adaptado, também as do currículo geral em português.
- **Cada tipo aprende com o próprio tipo:** cartas com cartas, respostas com respostas. O estilo de um parágrafo de carta não serve para um tópico de currículo.
- **Prompts `tailor_resume`, `cover_letter` e `form_answers` v2**, com as correções e, no currículo adaptado e na carta, a regra de não aumentar a participação (ADR 0025). **Correção não é fato:** a conferência contra os fatos continua igual.
- A auditoria registra só quantas correções foram usadas.

## Limitações conhecidas

- **Os prompts v2 não foram rodados com o Gemini real.** A mudança acrescenta um bloco de dados ao pedido, e os testes conferem o que a IA recebe, mas não a qualidade da resposta.
- **Material em inglês** ainda não existe: o currículo adaptado só aprende com currículos gerais em português.
- **Apagar a candidatura apaga as correções dela**, junto com o material, como deve ser.
