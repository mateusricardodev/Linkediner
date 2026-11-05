# ADR 0015 — Vagas importadas por usuário, sem acessar o link

- **Status:** Proposto
- **Data:** 2026-11-05
- **Decisores:** time LinkedIner

## Contexto

O modelo inicial previa uma tabela `jobs` global, deduplicada entre todos os usuários, e a importação manual "por texto ou link" (M-09). Duas questões apareceram ao implementar:

- Com tabela global, o texto colado por uma pessoa poderia aparecer para outra, e alguém mal-intencionado poderia alterar a vaga vista pelos demais.
- Acessar o link da vaga é scraping quando a fonte proíbe, como o LinkedIn (ADR 0006). O sistema não consegue distinguir com segurança as fontes que permitem.

## Decisão

- **Cada vaga importada pertence a quem importou**, com isolamento por RLS. A deduplicação vale só dentro do mesmo usuário.
- **O usuário cola o texto. O link fica guardado só como referência** para ele abrir a página da vaga. **O sistema nunca acessa esse link.**
- A IA organiza o texto em campos, e todo valor copiado é conferido contra o texto. O que não estiver lá é descartado. Senioridade e modelo de trabalho são classificações, e por isso não têm essa conferência.
- Contatos de recrutadores são removidos antes do envio à IA. O texto original fica guardado para o usuário consultar.
- As tabelas `job_sources` e `job_source_records` ficam para quando houver a primeira fonte automática (Fase 6).

## Consequências

- Positivas: nenhum risco de scraping nem de vazamento entre usuários; modelo simples.
- Negativas: a mesma vaga importada por duas pessoas é processada duas vezes, com custo de IA em dobro; o usuário precisa colar o texto, mesmo tendo o link. Vagas de fontes automáticas (Fase 6) precisarão de um modelo compartilhado, em uma nova migração.
