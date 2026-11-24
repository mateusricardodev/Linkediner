# ADR 0032 — Perfil profissional preenchido pelo documento e editado num formulário

- **Status:** Proposto
- **Data:** 2026-11-24
- **Decisores:** time LinkedIner

## Contexto

O usuário comparou a aba "Perfil profissional" com a do Linkelyzer e pediu o mesmo modelo: enviar o PDF do LinkedIn e ver os campos preenchidos sozinhos, num formulário com cabeçalho, sobre, experiência, formação, skills, idiomas e certificações, cada experiência num bloco que abre e fecha.

No LinkedIner, a leitura do documento já gerava os fatos (ADR 0012), mas:

- eles apareciam como cartões "Para revisar", com o trecho do documento e os botões confirmar, corrigir e recusar, e o usuário não reconhecia isso como o perfil preenchido;
- título, "Sobre", localização e setor não eram lidos do documento, e o perfil nem tinha localização e setor;
- não havia como a pessoa criar uma experiência ou uma skill que não estivesse num documento.

## Decisão

- **A extração lê também o cabeçalho** (prompt `extract_profile` v2): título, "Sobre", localização e setor. A regra anti-invenção do ADR 0012 vale igual, em código: cada valor precisa estar escrito no documento, ou fica de fora.
- **O cabeçalho só preenche campo vazio.** O que a pessoa escreveu nunca é trocado pela leitura de um documento. Valor maior que o limite fica de fora.
- **Localização e setor** entram no perfil (migração 0041). Os limites de título e "Sobre" sobem para os do LinkedIn (220 e 2.600 caracteres), para o texto de lá caber sem cortar.
- **Item digitado pela pessoa** (`POST /v1/profile/facts`) entra como `user_confirmed`, sem documento de origem: é a palavra dela, não uma dedução da IA.
- **Formulário único com salvar no fim.** Os fatos extraídos já aparecem preenchidos. Editar um item conta como confirmação. Remover vira `rejected`, para a próxima leitura do mesmo documento não trazer o item de volta, e a lista "itens removidos" permite restaurar. Sugestões (`suggested`) continuam marcadas e só entram se a pessoa confirmar.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Manter os cartões de revisão item a item | Foi o que o usuário achou confuso |
| Sobrescrever o cabeçalho a cada documento | Apagaria o que a pessoa escreveu à mão |
| Formulário livre, sem guardar a origem dos itens | Perde o trecho que comprova o item e a regra de não inventar nas gerações |

## Consequências

- A pessoa não precisa confirmar item por item: o extraído já conta como comprovado, como antes.
- Foto de perfil ficou de fora: exige guardar imagens, e a do LinkedIn não pode ser baixada (ADR 0006).
- O prompt v2 ainda precisa passar no ai-evals com o Gemini real.
