/**
 * Cliente da API. O frontend nunca acessa o banco nem provedores externos diretamente:
 * tudo passa pela API (docs/arquitetura/02-arquitetura-geral.md).
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function getApiStatus(): Promise<'ok' | 'degraded' | 'offline'> {
  try {
    const res = await fetch(`${API_URL}/health/ready`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    const body = (await res.json()) as { status: 'ok' | 'degraded' };
    return body.status;
  } catch {
    return 'offline';
  }
}
