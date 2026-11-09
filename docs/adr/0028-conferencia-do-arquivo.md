# ADR 0028 — Conferência do arquivo do currículo pelo padrão ATS

- **Status:** Proposto
- **Data:** 2026-11-09
- **Decisores:** time LinkedIner

## Contexto

A conferência ATS do ADR 0025 olha o currículo que o LinkedIner gera. Mas a primeira pergunta de quem chega é outra: "o currículo que eu já uso passa no ATS?". Os problemas mais comuns estão no próprio arquivo: PDF escaneado, colunas lado a lado, tabelas, contato dentro de ícones e informação presa em imagens.

## Decisão

- **A conferência roda quando o envio termina**, na API, junto da checagem de conteúdo que já existia. Não usa IA e não depende do consentimento de IA.
- **Só para o currículo.** O PDF do LinkedIn tem o layout do LinkedIn, que a pessoa não muda.
- **Guarda só o resultado** (`documents.file_check`): os itens, atendidos ou não, e a recomendação. Nem o texto nem os sinais medidos ficam guardados, e o resultado some junto com o documento.
- **Se o arquivo não puder ser medido, o envio segue normalmente**, só sem a conferência.
- **Conferências:**

| Item | Como é medido |
|---|---|
| O texto pode ser lido | Menos de 300 caracteres visíveis, uma página com pouco texto e quase toda coberta por imagem, ou mais texto invisível (camada de OCR) do que visível |
| Uma coluna, sem tabelas | No PDF, mais de 20% das linhas longas começando depois de 35% da largura da página, com trechos na mesma altura separados contando como linhas diferentes. No DOCX, qualquer tabela |
| Contato | E-mail e, além dele, telefone ou link do LinkedIn, no texto |
| Informação em imagem | Qualquer imagem no arquivo. O ATS não lê imagens, e não dá para saber se elas trazem informação |
| Símbolos ilegíveis | Caracteres de fontes de ícones (área de uso privado) ou trocados |
| Seções com nomes comuns | Experiência, Formação e Competências, em português ou inglês |
| Até 2 páginas | Só no PDF: o DOCX não tem páginas fixas |

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Rodar no worker, junto da extração | A extração depende do consentimento de IA. A conferência não precisa dele e responde na hora |
| Ler o texto das imagens com OCR | Custo e dependência a mais, para um aviso que já resolve: escreva como texto |
| Pedir à IA uma avaliação do layout | Sem ganho sobre regras para estes itens, e enviaria o arquivo para fora |

## Limitações conhecidas

- **Colunas por posição do texto:** um layout incomum, como um cabeçalho com nome e contato lado a lado, pode ser lido como coluna. Uma tabela num PDF só é detectada se ela também separa o texto em colunas.
- **Qualquer imagem gera aviso,** inclusive uma foto. O texto explica que o problema é a informação dentro da imagem.
- **Arquivos enviados antes desta mudança** não têm conferência. Basta enviar de novo.
