import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type {
  GenerateStructuredRequest,
  VersionedPrompt,
} from '../../../application/ports/ai-provider';
import { GeminiProvider, toGeminiJsonSchema, type GeminiClient } from './gemini-provider';

const prompt: VersionedPrompt = {
  id: 'teste.eco',
  version: 3,
  system: 'instrução de sistema',
  render: (input) => `texto: ${String(input.valor)}`,
};
const schema = z.object({ skills: z.array(z.string()), nota: z.string().nullable() });
const req: GenerateStructuredRequest<z.infer<typeof schema>> = {
  task: 'extract_profile',
  prompt,
  promptInput: { valor: 'abc' },
  schema,
};

function clientReturning(response: Awaited<ReturnType<GeminiClient['models']['generateContent']>>) {
  const generateContent = vi.fn(async () => response);
  const client: GeminiClient = { models: { generateContent, embedContent: vi.fn() } };
  return { client, generateContent };
}

describe('GeminiProvider', () => {
  it('usa o modelo da tarefa e, sem ele, o padrão', async () => {
    const { client, generateContent } = clientReturning({
      text: JSON.stringify({ skills: [], nota: null }),
    });
    const ai = new GeminiProvider(client, 'padrao', Date.now, { generate_resume: 'redacao' });
    await ai.generateStructured({ ...req, task: 'generate_resume' });
    await ai.generateStructured(req);
    const models = generateContent.mock.calls.map((call) => (call as unknown[])[0]);
    expect(models).toMatchObject([{ model: 'redacao' }, { model: 'padrao' }]);
  });

  it('envia prompt, instrução e esquema, e devolve os dados com a versão do prompt', async () => {
    const { client, generateContent } = clientReturning({
      text: JSON.stringify({ skills: ['TypeScript'], nota: null }),
      usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 },
    });
    const times = [100, 150];
    const ai = new GeminiProvider(client, 'modelo-x', () => times.shift()!);

    const result = await ai.generateStructured(req);

    expect(result.data).toEqual({ skills: ['TypeScript'], nota: null });
    expect(result.usage).toEqual({
      provider: 'gemini',
      model: 'modelo-x',
      promptId: 'teste.eco',
      promptVersion: 3,
      tokensIn: 11,
      tokensOut: 7,
      latencyMs: 50,
    });
    expect(generateContent).toHaveBeenCalledWith({
      model: 'modelo-x',
      contents: [{ role: 'user', parts: [{ text: 'texto: abc' }] }],
      config: expect.objectContaining({
        systemInstruction: 'instrução de sistema',
        temperature: 0,
        responseMimeType: 'application/json',
        responseJsonSchema: toGeminiJsonSchema(schema),
      }),
    });
  });

  it('não envia maxItems ao Gemini, mas a resposta ainda respeita o limite', async () => {
    const limited = z.object({
      maxItems: z.string(),
      items: z.array(z.object({ tags: z.array(z.string()).max(2) })).max(1),
    });
    const json = JSON.stringify(toGeminiJsonSchema(limited));
    expect(json).not.toContain('"maxItems":1');
    expect(json).not.toContain('"maxItems":2');
    // Um campo chamado maxItems é dado, não regra.
    expect(json).toContain('"maxItems":{"type":"string"}');

    const provider = new GeminiProvider(
      clientReturning({ text: '{"maxItems":"a","items":[{"tags":[]},{"tags":[]}]}' }).client,
      'm',
    );
    await expect(provider.generateStructured({ ...req, schema: limited })).rejects.toThrow(
      /fora do esquema/,
    );
  });

  it('rejeita JSON inválido e resposta fora do esquema sem expor o conteúdo', async () => {
    const invalid = new GeminiProvider(clientReturning({ text: 'dado-pessoal {' }).client, 'm');
    await expect(invalid.generateStructured(req)).rejects.toThrow(/JSON inválido/);
    await expect(invalid.generateStructured(req)).rejects.not.toThrow(/dado-pessoal/);

    const outside = new GeminiProvider(clientReturning({ text: '{"skills":"x"}' }).client, 'm');
    await expect(outside.generateStructured(req)).rejects.toThrow(/fora do esquema/);
  });

  it('resposta vazia vira erro', async () => {
    const ai = new GeminiProvider(clientReturning({}).client, 'm');
    await expect(ai.generateStructured(req)).rejects.toThrow(/não devolveu conteúdo/);
  });

  it('erro do provedor não vaza a mensagem original', async () => {
    const client: GeminiClient = {
      models: {
        generateContent: vi.fn(async () => {
          throw Object.assign(new Error('prompt com email@exemplo.com'), { status: 429 });
        }),
        embedContent: vi.fn(),
      },
    };
    const error = await new GeminiProvider(client, 'm').generateStructured(req).catch((e) => e);
    expect(error.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(error.details).toEqual({ providerStatus: 429 });
    expect(String(error.message)).not.toContain('email@exemplo.com');
    expect(error.cause).toBeUndefined();
  });

  it('exige um modelo configurado', async () => {
    const ai = new GeminiProvider(clientReturning({ text: '{}' }).client);
    await expect(ai.generateStructured(req)).rejects.toThrow(/Modelo não configurado/);
  });

  it('gera embeddings e confere a resposta', async () => {
    const client: GeminiClient = {
      models: {
        generateContent: vi.fn(),
        embedContent: vi.fn(async () => ({ embeddings: [{ values: [0.1, 0.2] }] })),
      },
    };
    const ai = new GeminiProvider(client, 'emb');
    await expect(ai.embed(['react'])).resolves.toEqual({
      vectors: [[0.1, 0.2]],
      model: 'emb',
      dims: 2,
    });
    await expect(ai.embed(['a', 'b'])).rejects.toThrow(/incompleta/);
  });
});

describe('toGeminiJsonSchema', () => {
  it('gera JSON Schema sem $schema, com campos obrigatórios e nulos explícitos', () => {
    const json = toGeminiJsonSchema(schema);
    expect(json).not.toHaveProperty('$schema');
    expect(json).toMatchObject({ type: 'object', required: ['skills', 'nota'] });
  });
});
