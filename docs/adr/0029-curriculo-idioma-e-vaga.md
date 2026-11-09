# ADR 0029 — Currículo em inglês e orientado por uma vaga salva

- **Status:** Proposto
- **Data:** 2026-11-09
- **Decisores:** time LinkedIner

## Contexto

O currículo melhorado saía sempre no idioma dos documentos e sempre geral. Vagas de tecnologia pedem currículo em inglês com frequência, e um currículo pensado para a vaga só existia dentro de uma candidatura, como material por vaga (ADR 0018).

## Decisão

- **Cada currículo guarda o idioma (`pt` ou `en`) e, se a pessoa quiser, uma vaga salva** (`resumes.language`, `resumes.job_id`). Apagar a vaga não apaga o currículo. Sem corpo, o pedido continua valendo como currículo geral em português.
- **A vaga precisa ser da pessoa e já estar analisada.** Se não for, o pedido é recusado antes de gastar o limite.
- **Prompt `generate_resume` v3:** escreve no idioma pedido, traduzindo o sentido sem acrescentar nada. A vaga vai sem o texto bruto, só título, empresa e requisitos, e **só orienta o que destacar**. Cargo e empresa da vaga podem ser citados, mas não comprovam nada (mesma regra do ADR 0018).
- **As correções que ensinam o estilo são do mesmo idioma** (ADR 0025): uma frase corrigida em português não ensina o inglês.
- **Arquivo exportado no idioma do currículo:** títulos das seções ("Summary", "Experience", "Skills"…) e nome do arquivo (`resume.pdf`).
- **Conferência ATS de um currículo para uma vaga** compara só com os requisitos dessa vaga.
- **Palavras de cargo traduzidas não viram sugestão.** A conferência contra os fatos marca palavras com maiúscula que não estão nos documentos. Em inglês, "Backend Developer" para "Desenvolvedora Backend" virava sugestão. Palavras de cargo como "Developer" e "Engineer" passam; nível e chefia, como "Senior", "Lead" e "Manager", continuam precisando estar nos fatos, porque afirmam algo.

**Validação com o Gemini, em 2026-11-09:** currículo fictício em inglês com 6 frases, todas comprovadas. "Participei da migração" virou "Participated in the migration", sem aumentar o papel.

## Limitações conhecidas

- **Formação, idiomas, certificações e o título do perfil não são traduzidos.** Vêm direto dos fatos, que não passam pela IA (ADR 0013), e saem no idioma dos documentos.
- **A conferência contra os fatos é mais fraca em inglês.** Ela compara números, nomes próprios e tecnologias, e não o sentido da tradução. A pessoa continua sendo a última revisão.
- **Um currículo orientado por vaga fica fora da candidatura.** O material por vaga continua sendo o caminho para enviar uma candidatura (ADR 0018).
