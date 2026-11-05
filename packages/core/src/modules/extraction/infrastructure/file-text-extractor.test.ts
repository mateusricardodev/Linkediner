import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { DOCX_MIME, PDF_MIME } from '../../documents';
import { buildTestPdf as buildPdf } from '../../../testing/files';
import { FileTextExtractor } from './file-text-extractor';

async function buildDocx(paragraph: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'uint8array' });
}

describe('FileTextExtractor', () => {
  const extractor = new FileTextExtractor();

  it('lê o texto de um PDF', async () => {
    const text = await extractor.extract(PDF_MIME, buildPdf('Engenheira Frontend na Empresa X'));
    expect(text).toContain('Engenheira Frontend na Empresa X');
  });

  it('não altera o buffer original do PDF', async () => {
    const bytes = buildPdf('Texto');
    await extractor.extract(PDF_MIME, bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('lê o texto de um DOCX', async () => {
    const text = await extractor.extract(DOCX_MIME, await buildDocx('Experiência com TypeScript'));
    expect(text).toContain('Experiência com TypeScript');
  });

  it('lança erro para arquivo corrompido', async () => {
    await expect(
      extractor.extract(PDF_MIME, new TextEncoder().encode('%PDF-1.4 lixo')),
    ).rejects.toThrow();
    await expect(
      extractor.extract(DOCX_MIME, new TextEncoder().encode('PK lixo')),
    ).rejects.toThrow();
  });

  it('recusa tipo não suportado', async () => {
    await expect(extractor.extract('image/png', new Uint8Array())).rejects.toThrow(/não suportado/);
  });
});
