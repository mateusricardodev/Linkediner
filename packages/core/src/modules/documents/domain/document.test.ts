import { describe, expect, it } from 'vitest';
import {
  DOCX_MIME,
  expiresAtFrom,
  inspectFileContent,
  objectKeyFor,
  PDF_MIME,
  validateUploadRequest,
} from './document';

const pdf = (body = '') => new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF`);
const docx = () => {
  const b = new Uint8Array(64);
  b.set([0x50, 0x4b, 0x03, 0x04]);
  b.set(new TextEncoder().encode('word/document.xml'), 30);
  return b;
};

describe('validateUploadRequest', () => {
  it('aceita PDF e DOCX para currículo, e só PDF para o LinkedIn', () => {
    expect(() => validateUploadRequest('resume', PDF_MIME, 1000)).not.toThrow();
    expect(() => validateUploadRequest('resume', DOCX_MIME, 1000)).not.toThrow();
    expect(() => validateUploadRequest('linkedin_pdf', DOCX_MIME, 1000)).toThrow(
      /LinkedIn deve ser um PDF/,
    );
    expect(() => validateUploadRequest('resume', 'image/png', 1000)).toThrow(/PDF ou DOCX/);
  });

  it('limita o tamanho a 10 MB', () => {
    expect(() => validateUploadRequest('resume', PDF_MIME, 10 * 1024 * 1024 + 1)).toThrow(/10 MB/);
    expect(() => validateUploadRequest('resume', PDF_MIME, 0)).toThrow();
  });
});

describe('inspectFileContent', () => {
  it('aceita um PDF comum', () =>
    expect(() => inspectFileContent(PDF_MIME, pdf('1 0 obj << /Type /Catalog >>'))).not.toThrow());

  it('rejeita arquivo que não é PDF mesmo declarado como PDF', () => {
    expect(() => inspectFileContent(PDF_MIME, new TextEncoder().encode('<html>'))).toThrow(
      /não é um PDF/,
    );
  });

  it('rejeita PDF protegido por senha ou com JavaScript', () => {
    expect(() => inspectFileContent(PDF_MIME, pdf('<< /Encrypt 5 0 R >>'))).toThrow(/senha/);
    expect(() =>
      inspectFileContent(PDF_MIME, pdf('<< /S /JavaScript /JS (app.alert(1)) >>')),
    ).toThrow(/scripts/);
  });

  it('valida DOCX pela estrutura ZIP', () => {
    expect(() => inspectFileContent(DOCX_MIME, docx())).not.toThrow();
    expect(() => inspectFileContent(DOCX_MIME, pdf())).toThrow(/DOCX/);
  });
});

describe('regras auxiliares', () => {
  it('chave do objeto fica sob o prefixo do usuário', () => {
    expect(objectKeyFor('u1', 'd1')).toBe('users/u1/documents/d1');
  });

  it('documento expira em 30 dias', () => {
    expect(expiresAtFrom(new Date('2026-11-05T00:00:00Z')).toISOString()).toBe(
      '2026-12-05T00:00:00.000Z',
    );
  });
});
