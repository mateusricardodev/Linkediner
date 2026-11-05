import { createHash } from 'node:crypto';
import { AppError } from '../../../../shared';
import type {
  AiProvider,
  AiResult,
  GenerateStructuredRequest,
} from '../../../application/ports/ai-provider';

type Responder = (req: GenerateStructuredRequest<unknown>) => unknown;

/**
 * Provedor de IA determinístico, sem rede. Usado em testes e no ambiente local.
 * As respostas são registradas por tarefa. A saída sempre passa pelo esquema, como num provedor real.
 */
export class FakeAiProvider implements AiProvider {
  readonly id = 'fake';
  readonly calls: GenerateStructuredRequest<unknown>[] = [];
  private readonly responders = new Map<string, Responder>();

  constructor(private readonly dims = 8) {}

  respond(task: GenerateStructuredRequest<unknown>['task'], responder: Responder): this {
    this.responders.set(task, responder);
    return this;
  }

  async generateStructured<T>(req: GenerateStructuredRequest<T>): Promise<AiResult<T>> {
    this.calls.push(req as GenerateStructuredRequest<unknown>);
    const responder = this.responders.get(req.task);
    if (!responder) {
      throw new AppError(
        'DEPENDENCY_UNAVAILABLE',
        `FakeAiProvider sem resposta configurada para "${req.task}".`,
      );
    }
    const parsed = req.schema.safeParse(responder(req as GenerateStructuredRequest<unknown>));
    if (!parsed.success) {
      throw new AppError('INTERNAL', `Resposta da IA fora do esquema para "${req.task}".`);
    }
    return {
      data: parsed.data,
      usage: {
        provider: this.id,
        model: req.model ?? 'fake-model',
        promptId: req.prompt.id,
        promptVersion: req.prompt.version,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: 0,
      },
    };
  }

  async embed(texts: string[]) {
    // Vetor derivado do hash do texto: mesmo texto, mesmo vetor.
    const vectors = texts.map((t) => {
      const h = createHash('sha256').update(t).digest();
      return Array.from({ length: this.dims }, (_, i) => (h[i]! / 255) * 2 - 1);
    });
    return { vectors, model: 'fake-embedding', dims: this.dims };
  }
}
