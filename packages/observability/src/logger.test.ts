import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';
import { createPseudonymizer } from './pseudonym';

function capture() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  return { lines, logger: createLogger({ service: 'test', destination }) };
}

describe('logger', () => {
  it('não escreve dados pessoais em nenhum nível de aninhamento', () => {
    const { lines, logger } = capture();
    logger.info(
      {
        user: { email: 'maria@example.com', name: 'Maria Silva' },
        document: { extractedText: 'Experiência na Empresa X desde 2019' },
        headers: { authorization: 'Bearer abc123' },
        items: [{ resume: 'conteúdo do currículo' }],
        documentId: '0193b2b0-0000-7000-8000-000000000001',
      },
      'documento processado',
    );
    const out = lines.join('');
    for (const pii of [
      'maria@example.com',
      'Maria Silva',
      'Empresa X',
      'abc123',
      'conteúdo do currículo',
    ]) {
      expect(out).not.toContain(pii);
    }
    expect(out).toContain('[REDACTED]');
    expect(out).toContain('0193b2b0-0000-7000-8000-000000000001');
    expect(out).toContain('"service":"test"');
  });

  it('serializa erros sem perder a mensagem', () => {
    const { lines, logger } = capture();
    logger.error({ err: new Error('falha ao extrair') }, 'erro');
    expect(lines.join('')).toContain('falha ao extrair');
  });
});

describe('pseudonymizer', () => {
  it('é determinístico e não revela o ID', () => {
    const p = createPseudonymizer('x'.repeat(32));
    const id = '0193b2b0-0000-7000-8000-000000000001';
    expect(p(id)).toBe(p(id));
    expect(p(id)).not.toContain(id);
    expect(p(id)).toHaveLength(16);
  });
});
