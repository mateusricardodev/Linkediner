# ADR 0014 — Exportação de currículos com pdfkit e docx

- **Status:** Proposto
- **Data:** 2026-11-05
- **Decisores:** time LinkedIner

## Contexto

A arquitetura previa gerar o PDF a partir de um template HTML, com Playwright e Chromium no worker. Para um currículo de uma coluna, isso significa levar um navegador inteiro para a imagem e tornar a exportação assíncrona, sem ganho visível.

## Decisão

- **PDF com `pdfkit`** e **DOCX com `docx`**, ambos em JavaScript puro. Os dois partem do mesmo modelo (`ResumeExportModel`), e a exportação responde na hora, pela API.
- **Uma coluna e texto selecionável**, o formato que os sistemas de recrutamento leem melhor.
- **Só currículo aprovado é exportado**, e só com frases comprovadas ou confirmadas. A aprovação é recusada enquanto houver sugestão pendente, e qualquer edição exige aprovar de novo.
- **Marca d'água como uma linha discreta no fim do PDF e no rodapé do DOCX.** Uma marca diagonal sobre o texto atrapalharia a leitura pelos sistemas de recrutamento, e prejudicaria justamente quem usa o plano gratuito.
- **A política de marca d'água é uma porta (`ExportPolicy`).** O valor vem da funcionalidade `export.watermark` do plano em vigor ([ADR 0021](0021-planos-limites-e-stripe.md)).

## Limitações

- O PDF usa as fontes padrão: cobre português e outras línguas ocidentais. Caracteres fora disso, como emojis ou alfabetos não latinos, são removidos do arquivo. O DOCX não tem essa limitação.
- O visual é simples e fixo. Modelos com mais design podem voltar a considerar HTML e Chromium.
- A marca d'água de texto pode ser removida do DOCX por quem o editar. Ela identifica o plano, não protege o arquivo.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| HTML com Playwright e Chromium | Imagem bem maior, consumo de memória e exportação assíncrona, sem ganho para um layout simples |
| pdf-lib | Sem novas versões desde 2022, e sem quebra automática de texto |
