import { describe, expect, it } from 'vitest';
import { canAnalyze, failureMessage, formatBytes, mimeTypeOf, validateFile } from './documents';

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const file = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('validateFile', () => {
  it('aceita PDF e DOCX no currículo', () => {
    expect(validateFile('resume', file('cv.pdf', PDF))).toBeNull();
    expect(validateFile('resume', file('cv.docx', DOCX))).toBeNull();
  });

  it('aceita só PDF no arquivo do LinkedIn', () => {
    expect(validateFile('linkedin_pdf', file('perfil.pdf', PDF))).toBeNull();
    expect(validateFile('linkedin_pdf', file('cv.docx', DOCX))).toMatch(/PDF/);
  });

  it('recusa outros tipos, arquivo vazio e acima do limite', () => {
    expect(validateFile('resume', file('foto.png', 'image/png'))).toMatch(/PDF ou DOCX/);
    expect(validateFile('resume', file('cv.pdf', PDF, 0))).toMatch(/vazio/);
    expect(validateFile('resume', file('cv.pdf', PDF, 10 * 1024 * 1024))).toBeNull();
    expect(validateFile('resume', file('cv.pdf', PDF, 10 * 1024 * 1024 + 1))).toMatch(/10 MB/);
  });
});

describe('mimeTypeOf', () => {
  it('usa a extensão só quando o sistema não informa o tipo', () => {
    expect(mimeTypeOf(file('CV.DOCX', ''))).toBe(DOCX);
    expect(mimeTypeOf(file('cv.pdf', ''))).toBe(PDF);
    expect(mimeTypeOf(file('cv.pdf', 'image/png'))).toBe('image/png');
    expect(mimeTypeOf(file('cv', ''))).toBe('');
  });
});

describe('canAnalyze', () => {
  it('oferece a análise só quando ela pode dar certo', () => {
    expect(canAnalyze({ status: 'uploaded', failureCode: null })).toBe(true);
    expect(canAnalyze({ status: 'failed', failureCode: 'processing_error' })).toBe(true);
    expect(canAnalyze({ status: 'failed', failureCode: 'no_text' })).toBe(false);
    expect(canAnalyze({ status: 'processing', failureCode: null })).toBe(false);
    expect(canAnalyze({ status: 'processed', failureCode: null })).toBe(false);
  });
});

describe('textos', () => {
  it('explica a falha, inclusive para um motivo desconhecido', () => {
    expect(failureMessage('no_text')).toMatch(/escaneado/);
    expect(failureMessage('novo_motivo')).toBe(failureMessage('processing_error'));
  });

  it('formata o tamanho em português', () => {
    expect(formatBytes(1536 * 1024)).toBe('1,5 MB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(10)).toBe('1 KB');
  });
});
