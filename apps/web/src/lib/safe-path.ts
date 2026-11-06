export const HOME_PATH = '/inicio';

/**
 * Destino depois do login. Só aceita caminho interno: um link como `?next=//site.example` não pode
 * levar a pessoa para fora do produto logo depois de ela digitar a senha.
 */
export function safePath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/')) return HOME_PATH;
  if (next.startsWith('//') || next.includes('\\') || /\s/.test(next)) return HOME_PATH;
  return next;
}
