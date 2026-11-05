import { createHmac } from 'node:crypto';

/**
 * Pseudonimiza um identificador para logs e eventos de produto.
 * O mesmo ID gera sempre o mesmo pseudônimo, o que permite correlacionar sem expor o ID real.
 */
export function createPseudonymizer(secret: string | undefined) {
  const key = secret ?? 'dev-only-pseudonym-secret-not-for-production';
  return (id: string): string =>
    createHmac('sha256', key).update(id).digest('base64url').slice(0, 16);
}
