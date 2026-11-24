# ADR 0034 — Análise do perfil do LinkedIn a partir do PDF

- **Status:** Proposto
- **Data:** 2026-11-24
- **Decisores:** time LinkedIner

## Contexto

O usuário pediu uma tela "Análise de LinkedIn" no modelo do Linkelyzer: a pessoa sobe o perfil e vê a nota geral, um resumo com pontos fortes, pontos de melhoria e palavras-chave ausentes, e uma seção por parte do perfil, com nota, análise, checklist do que mudar e um texto pronto para colar. O texto pronto deve ser só dos planos pagos, mas visível já para testar.

O LinkedIner não lê páginas do LinkedIn (ADR 0006). A fonte é o PDF que a própria pessoa exporta ("Salvar como PDF"), o mesmo que já preenche o perfil (ADR 0032).

## Decisão

- **Módulo `linkedin`**, com a tabela `linkedin_analyses` (migração 0042, RLS por usuário). O resultado tem trechos do perfil e fica cifrado por usuário (ADR 0020). A análise continua depois que o PDF expira.
- **Uma chamada de IA por análise** (`analyze_linkedin`, prompt v1), no worker, com o texto do PDF sem dados de contato e o cargo do objetivo ativo como alvo das palavras-chave.
- **A nota geral é calculada no código**, pela média ponderada das notas das seções (experiência pesa 25; título, sobre e competências, 15; formação, completude e palavras-chave, 10). Assim ela sempre bate com as notas que a pessoa vê.
- **Texto pronto sem invenção**: só para título, sobre e experiência. Um número que não está no perfil descarta o texto (ADR 0012). A pessoa é avisada para revisar antes de colar.
- **Planos**: `linkedin.analysis` limita as análises por mês (gratuito 2, Pro 20, Avançado 60). `linkedin.rewrites` libera o texto pronto só nos planos pagos: no gratuito, a API não envia o texto e a tela mostra o aviso para desbloquear.
- **Checklist salvo na análise**: as ações têm ids estáveis (`headline-1`), e o progresso aparece no painel "Próximos passos".
- O checklist de configurações do LinkedIn ("aberto a vagas", URL personalizada e outros), que ficava no perfil, mudou para esta tela.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Reaproveitar o score do perfil | Mistura currículo e LinkedIn e não diz o que mudar em cada parte |
| Nota geral dada pela IA | Pode não bater com as notas das seções |
| Ler o perfil pela URL | Proibido pelos termos do LinkedIn (ADR 0006) |

## Consequências

- O prompt ainda precisa entrar na avaliação (ai-evals) com perfis sintéticos.
- No plano gratuito do Gemini, a análise depende dos modelos de reserva (ADR 0033) nos picos de demanda. Quando falha, a tela oferece "Tentar de novo" com o mesmo PDF, e o limite do plano é devolvido.
