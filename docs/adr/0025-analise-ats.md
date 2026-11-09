# ADR 0025 — Conferência ATS e aprendizado com as correções

- **Status:** Proposto
- **Data:** 2026-11-09
- **Decisores:** time LinkedIner

## Contexto

A análise precisa seguir o padrão de currículo dos sistemas de recrutamento (ATS), sempre recomendar melhorias pontuais e aprender com as correções que a pessoa faz. Até aqui, o score do perfil (ADR 0013) dava recomendações genéricas, e a geração do currículo não usava as correções: só as sugestões confirmadas viravam fatos.

## Decisão

### Conferência ATS

- **Regras fixas, sem IA**, como o score v1. A mesma entrada sempre gera o mesmo resultado, sem custo e sem enviar dados. A versão das regras (`ATS_RULES_VERSION`) acompanha o resultado.
- **Calculada na leitura** (`GET /v1/resumes/:id/ats`), sem gravar nada, e refeita a cada decisão da pessoa.
- **Conferências do documento:** título profissional, link do LinkedIn, resumo, datas em todas as experiências, pelo menos 2 tópicos por experiência, resultados medidos, pelo menos 6 competências, formação ou certificações, idiomas e termos das vagas salvas.
- **Melhorias pontuais por frase:** começar com verbo de ação no passado, sem começos que não dizem o que a pessoa fez ("Responsável por", "Fui", "Atuei"), até 220 caracteres, sem primeira pessoa explícita, sem emojis e símbolos, e um resultado medido por experiência.
- **Termos das vagas salvas:** tecnologias conhecidas que as 20 vagas analisadas mais recentes pedem e que não aparecem no currículo, das mais pedidas para as menos. A recomendação diz para incluir só se a pessoa tiver essa experiência: a conferência nunca afirma que ela tem.
- **Sem exagerar a participação.** "Participei", "Ajudei" e "Contribuí" são aceitos: dizem o tamanho real do papel. Nem a dica nem o prompt sugerem trocar por "Liderei" ou "Executei". Na validação com o Gemini, a primeira versão do prompt transformou "Participei da migração" em "Executei a migração", e a regra entrou por isso.
- Frases removidas não contam, nem para passar nem para receber dica. O resumo não precisa começar com verbo.

### Aprender com as correções

- **O texto gerado fica guardado na frase quando a pessoa a corrige** (`originalText`), dentro do conteúdo do currículo, que já é cifrado com a chave da pessoa (ADR 0020). Não há tabela nova: apagar o currículo apaga as correções, e a exportação de dados já as inclui.
- **A próxima geração recebe até 10 frases corrigidas e 10 removidas**, das mais recentes, sem repetir e sem o currículo que está sendo gerado.
- **Prompt `generate_resume` v2:** traz as regras ATS e as correções. As corrigidas mostram o estilo a seguir, e as removidas, o que não repetir. **Correção não é fato:** ela não comprova nada, e a conferência contra os fatos (ADR 0012) continua igual.
- A auditoria registra só quantas correções foram usadas.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| IA avaliando o currículo | Custo, resultado que muda a cada chamada e mais dados enviados, sem ganho claro sobre regras |
| Tabela própria de correções | Mais um lugar para cifrar, apagar e exportar. Guardar na frase resolve com o que já existe |
| Ajustar o modelo com as correções de todos | Exige consentimento específico e usa dados de uma pessoa para outra |

## Limitações conhecidas

- **Verbo de ação por regra:** o português reconhece a primeira pessoa do pretérito ("Desenvolvi", "Liderei"), e o inglês, "-ed" e uma lista de irregulares. Uma frase boa com outra construção pode receber a dica.
- **Termos das vagas** dependem da lista de tecnologias conhecidas do módulo de compatibilidade. Um nome fora dela não aparece.
- **O aprendizado vale para o currículo geral.** O currículo adaptado à vaga, a carta e as respostas ainda não recebem as correções.
- **A conferência é de conteúdo, não do arquivo.** O PDF e o DOCX já saem em uma coluna e com texto selecionável (ADR 0014), e não são lidos de volta.
- As regras ATS do prompt v2 ainda não têm avaliação própria no `ai-evals`.
