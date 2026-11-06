import { describe, expect, it } from 'vitest';
import { HOME_PATH, safePath } from './safe-path';

describe('safePath', () => {
  it('aceita caminho interno', () => {
    expect(safePath('/vagas?filtro=1')).toBe('/vagas?filtro=1');
  });

  it.each([
    null,
    undefined,
    '',
    'https://site.example',
    '//site.example',
    '/\\site.example',
    'javascript:alert(1)',
    '/a\nb',
  ])('recusa %s', (value) => {
    expect(safePath(value)).toBe(HOME_PATH);
  });
});
