# ADR 0035 — Análise de currículo separada da geração

- **Status:** Proposto
- **Data:** 2026-11-24
- **Decisores:** time LinkedIner

## Contexto

A página "Currículo" misturava duas tarefas: gerar um currículo novo e entender o que está errado no currículo que a pessoa já usa. O usuário pediu para separar as duas, no modelo do Linkelyzer:

- **"Análise de currículo":** um campo para anexar o arquivo, o botão "Analisar" e, embaixo, os currículos já analisados. Sem escolha de idioma.
- **"Gerar currículo":** a geração em etapas, que fica para outra mudança.

Já existia a conferência do arquivo pelo padrão ATS (ADR 0028). Ela não usa IA, mas só aparecia na lista de documentos do perfil e não avaliava o conteúdo. O usuário escolheu juntar essa conferência a uma análise por IA igual à do LinkedIn (ADR 0034).

## Decisão

- **Módulo `resume-analysis`:**
  - **Tabela:** `resume_analyses` (migração 0043), com RLS por usuário. O resultado é cifrado por usuário (ADR 0020).
  - **Exportação:** a tabela entra na exportação de dados.
  - **Arquivo expirado:** a análise continua depois que o arquivo expira.
- **A conferência ATS vira a seção "Leitura pelo ATS":**
  - **Nota:** a parte dos itens atendidos.
  - **Ações:** cada item que falhou vira uma ação do checklist, com a recomendação da conferência.
  - **Sem IA:** a seção é montada no código, a partir do `documents.file_check` do arquivo enviado.
  - **Arquivo que não pôde ser medido:** a seção fica de fora, e a nota usa só as outras.
- **IA para o conteúdo:**
  - **Chamada:** uma por análise (`analyze_resume`, prompt v1), no worker.
  - **Texto enviado:** o texto do arquivo sem dados de contato.
  - **Alvo das palavras-chave:** o cargo do objetivo ativo.
  - **Seções avaliadas:** resumo, experiência, resultados e impacto, competências, formação e palavras-chave.
- **A nota geral é calculada no código:**
  - **Cálculo:** média ponderada das notas das seções.
  - **Pesos:** experiência 25; ATS, resultados, competências e palavras-chave 15 cada; resumo 10; formação 5.
  - **Seções ausentes:** a média usa só as seções presentes.
- **Sem texto pronto para colar.** Reescrever o currículo é a função de "Gerar currículo", que já segue a regra de não inventar (ADR 0012). Aqui o prompt pede para a pessoa acrescentar um dado, como um resultado medido, só se ele existir.
- **Plano:** `resume.analysis` limita as análises por mês: gratuito 2, Pro 20, Avançado 60.
- **Perfil profissional:** o mesmo envio também atualiza o perfil profissional. A extração continua passando pela conferência dos fatos.
- **Tela compartilhada:**
  - **Componente:** o detalhe da análise virou `AnalysisReport`, usado pelas duas análises, a de currículo e a do LinkedIn.
  - **O que fica com o LinkedIn:** o texto pronto e o link "Editar no LinkedIn" entram por parâmetros.
- **Menu:** "Currículo" virou dois itens, "Análise de currículo" e "Gerar currículo".

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Só a conferência ATS, sem IA | Não diz o que mudar no conteúdo. O usuário escolheu ATS e IA juntos |
| Guardar as duas análises na mesma tabela, com um campo de tipo | Mistura seções e regras diferentes (texto pronto e plano só no LinkedIn) |
| Nota ATS fora da nota geral | A pessoa veria uma nota boa com um arquivo que o ATS não lê |

## Consequências

- **Avaliação:** o prompt ainda precisa entrar na avaliação (ai-evals) com currículos sintéticos.
- **IA sobrecarregada:** no plano gratuito do Gemini, a análise depende dos modelos de reserva (ADR 0033). Quando falha, a tela oferece "Tentar de novo" com o mesmo arquivo, e o limite do plano é devolvido.
- **Atalho do Início:** "Analisar currículo" passou a apontar para a nova página.
