/**
 * Cliente da API. O frontend nunca acessa o banco nem provedores externos diretamente:
 * tudo passa pela API (docs/arquitetura/02-arquitetura-geral.md).
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const OFFLINE_MESSAGE =
  'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.';

/** Mensagens do login vêm em inglês da biblioteca de autenticação: aqui elas viram português. */
const AUTH_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'E-mail ou senha incorretos.',
  USER_ALREADY_EXISTS: 'Já existe uma conta com este e-mail.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Já existe uma conta com este e-mail.',
  PASSWORD_TOO_SHORT: 'A senha precisa ter pelo menos 10 caracteres.',
  INVALID_EMAIL: 'Confira o e-mail informado.',
};
const GENERIC_MESSAGE = 'Algo deu errado. Tente de novo em instantes.';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  code?: string;
  title?: string;
  detail?: string;
  message?: string;
  details?: Record<string, unknown>;
}

function toError(status: number, body: ErrorBody | null): ApiError {
  const code = body?.code ?? 'UNKNOWN';
  // `title` e `detail` são o texto seguro da nossa API (Problem Details). O `message` de terceiros
  // só passa pela tabela acima, e "Erro interno" não ajuda quem está usando.
  const ownMessage = code === 'INTERNAL' ? undefined : (body?.detail ?? body?.title);
  const message = AUTH_MESSAGES[code] ?? ownMessage ?? GENERIC_MESSAGE;
  return new ApiError(message, status, code, body?.details);
}

/** Chamada autenticada pelo cookie de sessão, que é HttpOnly: o código nunca lê o token. */
async function send(path: string, options: { method?: string; body?: unknown }): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      ...(options.body !== undefined
        ? {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(options.body),
          }
        : {}),
    });
  } catch {
    throw new ApiError(OFFLINE_MESSAGE, 0, 'OFFLINE');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw toError(response.status, body);
  }
  return response;
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await send(path, options);
  if (response.status === 204) return undefined as T;
  return (await response.json().catch(() => null)) as T;
}

/** Para arquivos gerados pela API, como o currículo exportado. */
export async function apiBlob(path: string): Promise<Blob> {
  const response = await send(path, {});
  return response.blob();
}
