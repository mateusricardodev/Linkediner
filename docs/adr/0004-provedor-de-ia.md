# ADR 0004 — Abstração de provedor de IA, com Gemini como primeira implementação

- **Status:** Proposto
- **Data:** 2026-11-05
- **Decisores:** time LinkedIner

## Contexto

A primeira integração será com o Gemini, mas o produto não pode depender dele de forma irreversível. Pelos termos atuais do Gemini API, o conteúdo enviado no plano gratuito pode ser usado pelo Google para melhorar produtos, enquanto no plano pago não. Toda geração importante precisa registrar provedor, modelo, versão do prompt e resultado.

## Decisão

- Porta `AiProvider` (`generateStructured` com esquema Zod e `embed`). Implementações: `GeminiProvider` (`@google/genai`) e `FakeAiProvider` (testes e ambiente local).
- Modelo por tarefa definido em configuração.
- Prompts versionados no repositório e imutáveis depois de publicados.
- Tabela `ai_generations` com provedor, modelo, prompt e versão, hash da entrada, saída criptografada, validação, tokens, custo e latência.
- **Plano gratuito do Gemini apenas para protótipo, com dados sintéticos.** Em produção, a aplicação exige `AI_TIER=paid` e se recusa a iniciar sem ele.
- Treinamento com dados de usuários desativado. Ativá-lo exige o consentimento `model_training` e um novo ADR.

## Alternativas consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Chamar o SDK do Gemini direto nos casos de uso | Dependência irreversível e testes difíceis |
| Frameworks de orquestração (LangChain etc.) | Abstração grande demais para o que precisamos. Nossa porta é pequena e específica. |

## Consequências

- Positivas: trocar de provedor ou de modelo é configuração + adaptador; testes determinísticos; auditoria de cada geração.
- Negativas: recursos específicos de um provedor só entram se couberem na porta (ou como capacidades opcionais).
