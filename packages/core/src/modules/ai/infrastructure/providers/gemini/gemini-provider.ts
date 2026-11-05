import { z, type ZodType } from 'zod';
import { AppError } from '../../../../shared';
import type {
  AiProvider,
  AiResult,
  GenerateStructuredRequest,
} from '../../../application/ports/ai-provider';

/** Parte do SDK @google/genai usada aqui. Permite testar o adaptador sem chamar a rede. */
export interface GeminiClient {
  models: {
    generateContent(params: {
      model: string;
      contents: { role: 'user'; parts: unknown[] }[];
      config: Record<string, unknown>;
    }): Promise<{
      text?: string | undefined;
      usageMetadata?:
        | {
            promptTokenCount?: number | undefined;
            candidatesTokenCount?: number | undefined;
          }
        | undefined;
    }>;
    embedContent(params: {
      model: string;
      contents: string[];
    }): Promise<{ embeddings?: { values?: number[] | undefined }[] | undefined }>;
  };
}

/** Converte o esquema Zod no formato aceito por responseJsonSchema. */
export function toGeminiJsonSchema(schema: ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema, { io: 'input' });
  return json;
}

/**
 * Adaptador do Gemini (ADR 0004). Erros nunca carregam prompts nem respostas, que podem ter dados
 * do usuário: só o código de status do provedor sai daqui.
 */
export class GeminiProvider implements AiProvider {
  readonly id = 'gemini';

  constructor(
    private readonly client: GeminiClient,
    private readonly defaultModel?: string,
    private readonly now: () => number = Date.now,
  ) {}

  async generateStructured<T>(req: GenerateStructuredRequest<T>): Promise<AiResult<T>> {
    const model = req.model ?? this.defaultModel;
    if (!model) throw new AppError('INTERNAL', `Modelo não configurado para "${req.task}".`);

    const parts: unknown[] = [{ text: req.prompt.render(req.promptInput) }];
    for (const file of req.files ?? []) {
      parts.push({
        inlineData: { mimeType: file.mimeType, data: Buffer.from(file.data).toString('base64') },
      });
    }

    const started = this.now();
    let response: Awaited<ReturnType<GeminiClient['models']['generateContent']>>;
    try {
      response = await this.client.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: req.prompt.system,
          temperature: req.temperature ?? 0,
          responseMimeType: 'application/json',
          responseJsonSchema: toGeminiJsonSchema(req.schema),
          ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
        },
      });
    } catch (error) {
      throw providerError(req.task, error);
    }

    return {
      data: parseOutput(response.text, req),
      usage: {
        provider: this.id,
        model,
        promptId: req.prompt.id,
        promptVersion: req.prompt.version,
        tokensIn: response.usageMetadata?.promptTokenCount ?? 0,
        tokensOut: response.usageMetadata?.candidatesTokenCount ?? 0,
        latencyMs: this.now() - started,
      },
    };
  }

  async embed(texts: string[], opts?: { model?: string }) {
    const model = opts?.model ?? this.defaultModel;
    if (!model) throw new AppError('INTERNAL', 'Modelo de embedding não configurado.');
    let response: Awaited<ReturnType<GeminiClient['models']['embedContent']>>;
    try {
      response = await this.client.models.embedContent({ model, contents: texts });
    } catch (error) {
      throw providerError('embed', error);
    }
    const vectors = (response.embeddings ?? []).map((e) => e.values ?? []);
    if (vectors.length !== texts.length || vectors.some((v) => v.length === 0)) {
      throw new AppError('INTERNAL', 'Resposta de embedding incompleta.');
    }
    return { vectors, model, dims: vectors[0]?.length ?? 0 };
  }
}

function parseOutput<T>(text: string | undefined, req: GenerateStructuredRequest<T>): T {
  if (!text) throw new AppError('INTERNAL', `A IA não devolveu conteúdo para "${req.task}".`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AppError('INTERNAL', `A IA devolveu JSON inválido para "${req.task}".`);
  }
  const parsed = req.schema.safeParse(json);
  if (!parsed.success) {
    throw new AppError('INTERNAL', `Resposta da IA fora do esquema para "${req.task}".`);
  }
  return parsed.data;
}

function providerError(task: string, error: unknown): AppError {
  const status = (error as { status?: unknown }).status;
  return new AppError(
    'DEPENDENCY_UNAVAILABLE',
    `Falha ao chamar o provedor de IA em "${task}".`,
    typeof status === 'number' ? { providerStatus: status } : undefined,
  );
}
