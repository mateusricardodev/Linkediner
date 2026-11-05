# 05 — IA e processamento de documentos

## 7. Processamento de PDFs e documentos

### Entrada

| Etapa | Como |
|---|---|
| Upload | Direto para o storage via URL assinada (a API não trafega o arquivo). Limite de 10 MB. |
| Validação | Tipo real verificado pelos primeiros bytes (*magic bytes*), não pela extensão. Aceita PDF e DOCX. Rejeita arquivos criptografados ou com scripts embutidos. |
| Extração de texto | PDF digital: unpdf/pdf.js. DOCX: mammoth. |
| PDF escaneado | Sem texto selecionável, o documento falha com `no_text` e a IA não é chamada ([ADR 0012](../adr/0012-extracao-so-com-texto-verificavel.md)). Se for preciso OCR no futuro, entra como outro adaptador de `TextExtractor`. |
| PDF do LinkedIn | Usa o mesmo caminho do currículo. Um parser específico fica para quando houver PDFs reais para avaliar a extração ([ADR 0012](../adr/0012-extracao-so-com-texto-verificavel.md)). |
| Isolamento | A extração roda no worker, com limites de tempo e de memória por tarefa. |
| Armazenamento | O arquivo original expira em 30 dias. O texto extraído é guardado criptografado com a chave do usuário. |

### Saída (currículos gerados)

- O currículo é montado a partir dos fatos aprovados, num template HTML/CSS, e convertido para PDF com Playwright/Chromium no worker.
- Templates compatíveis com ATS: uma coluna, texto selecionável e sem tabelas complexas.
- Marca d'água no plano gratuito, aplicada na renderização e controlada por entitlement.
- Exportação também em DOCX (via `docx`) e texto puro.

## 8. Integração com IA

### Abstração de provedor

```ts
// packages/core/src/modules/ai/application/ports/ai-provider.ts
export interface AiProvider {
  readonly id: string;                        // 'gemini', 'openai', 'local'...
  generateStructured<T>(req: {
    task: AiTask;                             // extract_profile, generate_resume...
    prompt: VersionedPrompt;                  // id + versão + texto renderizado
    schema: ZodType<T>;                       // saída validada
    input: { text?: string; files?: AiFile[] };
    options?: { temperature?: number; maxOutputTokens?: number };
  }): Promise<AiResult<T>>;                   // inclui modelo, tokens, latência
  embed(texts: string[], opts: { model: string }): Promise<number[][]>;
}
```

- A primeira implementação é `GeminiProvider` (`@google/genai`). Também existe um `FakeAiProvider` determinístico, usado nos testes.
- O modelo de cada tarefa vem da configuração (`AI_MODEL_EXTRACT`, `AI_MODEL_GENERATE`...). Trocar de modelo não exige mudar código.
- Trocar de provedor significa implementar a interface e mudar a configuração. Os embeddings guardam `model` e `dims`, e uma troca de modelo de embedding dispara a reindexação.

### Prompts versionados

- Os prompts ficam em `modules/ai/prompts/<tarefa>/v<N>.ts`, revisados por PR e nunca editados depois de publicados: uma mudança vira nova versão.
- Toda geração importante grava em `ai_generations`: provedor, modelo, `prompt_id`, `prompt_version`, hash da entrada, saída, validação, tokens, custo e latência.

### Regra anti-invenção (grounding)

Essa é a regra mais importante do produto. Ela é aplicada em código, e não apenas pedida no prompt.

1. **Extração com referência:** cada fato extraído vem com `source_span` (trecho do texto original). O validador confere se o trecho existe no documento. Fato sem trecho correspondente é descartado.
2. **Geração com citações:** o esquema de saída exige que cada item gerado (bullet, frase da carta, resposta de formulário) traga a lista de `fact_ids` que o sustentam.
3. **Validação pós-geração:**
   - item sem `fact_ids`, ou com IDs que não existem → vira `suggested`;
   - número, empresa, cargo, tecnologia ou certificação que não aparece nos fatos citados → vira `suggested` (verificação por extração de entidades e comparação de valores).
4. **Interface:** itens `suggested` aparecem destacados como "Precisa da sua confirmação" e ficam fora da exportação até o usuário confirmar.
5. **Avaliação contínua:** um conjunto de currículos de teste com respostas esperadas mede a taxa de invenção a cada mudança de prompt ou de modelo (ver [08 — Testes](08-operacao.md)).

### Score explicável e sem viés

- **A IA não decide o número.** A IA extrai fatos e sinais (por exemplo: "experiência tem métrica de resultado: sim ou não"), e uma **rubrica determinística e versionada** calcula o score com pesos definidos em código ([ADR 0007](../adr/0007-score-explicavel.md)).
- Cada ponto do score é rastreável a um critério. A interface mostra os fatores positivos, as lacunas e as recomendações.
- **Atributos sensíveis removidos antes do processamento:** nome, foto, data de nascimento, gênero, estado civil, deficiência, raça, endereço completo. A IA recebe o perfil pseudonimizado.
- Nenhum critério da rubrica usa idade, gênero, raça ou deficiência, nem proxies óbvios (ano de formatura como indicador de idade, por exemplo).
- O texto da interface reforça: "Este score mede a preparação do perfil. Não indica chance de contratação."

### Dados e treinamento

- Treinamento com dados de usuários: **desativado**. Ativá-lo exige o consentimento `model_training`, separado e explícito, além de um novo ADR.
- **Plano gratuito do Gemini:** apenas protótipo, com dados sintéticos ou do próprio time. Pelos termos atuais, o Google pode usar o conteúdo enviado no plano gratuito para melhorar produtos. Antes de qualquer usuário real, é preciso migrar para o plano pago (em que os dados não são usados para treino, conforme os termos) ou para outro provedor com garantia equivalente.
- **Controle de custo:**
  - cache por `input_hash` (o mesmo currículo não é reprocessado);
  - modelo mais barato para extração e classificação, e um mais capaz só para geração;
  - quota por plano.

### Tarefas de IA

| Tarefa | Entrada | Saída (esquema Zod) | Quando |
|---|---|---|---|
| `extract_profile` | Texto ou PDF | Fatos com `source_span` | Upload |
| `score_profile_signals` | Fatos | Sinais da rubrica + textos explicativos | Após extração |
| `structure_job` | Descrição da vaga | Requisitos, senioridade, stack, faixa salarial | Importação |
| `match_explain` | Fatos + vaga + resultado da rubrica | Explicação das coincidências e lacunas | Matching |
| `generate_resume` | Fatos aprovados + vaga (opcional) | Seções com `fact_ids` | Pedido do usuário |
| `generate_cover_letter` | Fatos aprovados + vaga | Parágrafos com `fact_ids` | Pedido do usuário |
| `answer_form` | Fatos + perguntas | Respostas com `fact_ids` | Candidatura |
| `classify_job` | Vaga + preferências | Rótulos de aderência | Recomendação |
