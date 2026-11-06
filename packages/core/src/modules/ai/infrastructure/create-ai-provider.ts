import { GoogleGenAI } from '@google/genai';
import type { AppConfig } from '@linkediner/config';
import type { AiProvider } from '../application/ports/ai-provider';
import { FakeAiProvider } from './providers/fake/fake-ai-provider';
import { GeminiProvider, type GeminiClient } from './providers/gemini/gemini-provider';

/** Escolhe o provedor pela configuração. A troca de provedor não exige mudar o domínio (ADR 0004). */
export function createAiProvider(
  config: Pick<
    AppConfig,
    'AI_PROVIDER' | 'GEMINI_API_KEY' | 'AI_MODEL_EXTRACT' | 'AI_MODEL_GENERATE'
  >,
): AiProvider {
  if (config.AI_PROVIDER === 'gemini') {
    // A validação da configuração já garante a chave quando o provedor é Gemini.
    const client = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY! });
    // Extrair e organizar pedem um modelo. Redigir pode usar outro. Sem ele, vale o mesmo.
    const generate = config.AI_MODEL_GENERATE ?? config.AI_MODEL_EXTRACT;
    return new GeminiProvider(
      client as unknown as GeminiClient,
      config.AI_MODEL_EXTRACT,
      Date.now,
      generate
        ? { generate_resume: generate, generate_cover_letter: generate, answer_form: generate }
        : {},
    );
  }
  return new FakeAiProvider();
}
