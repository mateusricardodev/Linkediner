import { crc32, deflateSync } from 'node:zlib';
import { Document, Packer, Paragraph, Table, TableCell, TableRow } from 'docx';
import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';
import { DOCX_MIME, PDF_MIME } from '../domain/document';
import { evaluateFileCheck } from '../domain/file-check';
import { FileSignalsReader, sideBySideRatio } from './file-signals';

// Currículos fictícios, montados aqui mesmo: nenhum dado de ninguém.
const CONTACT = 'ana.teste@example.com | (12) 99999-0000 | linkedin.com/in/ana-teste';
const SECTIONS = {
  experience: [
    'Experiência',
    'Desenvolvedora Backend - Empresa Exemplo (2021 - atual)',
    'Reduzi o tempo de resposta da API de pedidos em 35% com cache em Redis.',
    'Mantive as APIs de pagamento em Node.js e PostgreSQL para 40 lojas.',
  ],
  education: ['Formação', 'Bacharelado em Sistemas de Informação - Universidade Exemplo'],
  skills: ['Competências', 'Node.js, PostgreSQL, Redis, Docker, React e TypeScript'],
};

function pdf(draw: (doc: PDFKit.PDFDocument) => void): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 54 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    draw(doc);
    doc.end();
  });
}

const lines = (doc: PDFKit.PDFDocument, text: string[], x?: number, width?: number) => {
  for (const line of text) doc.text(line, x, undefined, width ? { width } : undefined);
};

/** PNG cinza de 8x8, montado aqui: basta para ocupar a página como uma digitalização. */
function grayPng(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(8, 0);
  header.writeUInt32BE(8, 4);
  header[8] = 8; // 8 bits por pixel
  header[9] = 0; // tons de cinza
  // Cada linha: filtro 0 e 8 pixels cinza.
  const pixels = Buffer.concat(
    Array.from({ length: 8 }, () => Buffer.from([0, ...Array(8).fill(128)])),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const reader = new FileSignalsReader();
const failing = async (mime: string, bytes: Uint8Array) => {
  const signals = await reader.read(mime, bytes);
  return evaluateFileCheck(signals!)
    .checks.filter((c) => !c.ok)
    .map((c) => c.id);
};

describe('FileSignalsReader', () => {
  it('PDF de uma coluna, com contato e seções, passa em tudo', async () => {
    const bytes = await pdf((doc) => {
      doc.fontSize(18).text('Ana Teste');
      doc.fontSize(10).text(CONTACT);
      // Data alinhada à direita na mesma linha não é uma segunda coluna.
      doc.text('Desenvolvedora Backend', 54, 140);
      doc.text('2021 - atual', 450, 140);
      lines(doc, [...SECTIONS.experience, ...SECTIONS.education, ...SECTIONS.skills], 54);
    });
    await expect(failing(PDF_MIME, bytes)).resolves.toEqual([]);
  });

  it('PDF com duas colunas lado a lado é apontado', async () => {
    const bytes = await pdf((doc) => {
      doc.fontSize(10).text(CONTACT);
      const top = 120;
      doc.text(SECTIONS.skills.join('. '), 54, top, { width: 180 });
      for (const [index, line] of [...SECTIONS.experience, ...SECTIONS.education].entries()) {
        doc.text(`${line} com mais detalhes para ocupar a linha`, 260, top + index * 30, {
          width: 280,
        });
      }
    });
    const signals = await reader.read(PDF_MIME, bytes);
    expect(signals!.sideBySideRatio).toBeGreaterThan(0.2);
    await expect(failing(PDF_MIME, bytes)).resolves.toContain('single_column');
  });

  it('PDF só com imagem, como uma digitalização, não tem texto legível', async () => {
    const bytes = await pdf((doc) => {
      doc.image(grayPng(), 0, 0, { width: 595, height: 842 });
    });
    const report = evaluateFileCheck((await reader.read(PDF_MIME, bytes))!);
    const readable = report.checks.find((c) => c.id === 'readable_text');
    expect(readable).toMatchObject({ ok: false });
    expect(readable?.recommendation).toMatch(/1 página parece uma imagem/);
    expect(report.checks.find((c) => c.id === 'images')?.ok).toBe(false);
  });

  it('DOCX com tabela é apontado, e DOCX não conta páginas', async () => {
    const paragraph = (text: string) => new Paragraph(text);
    const doc = new Document({
      sections: [
        {
          children: [
            paragraph(CONTACT),
            ...[...SECTIONS.experience, ...SECTIONS.education].map(paragraph),
            new Table({
              rows: [
                new TableRow({
                  children: SECTIONS.skills.map(
                    (text) => new TableCell({ children: [paragraph(text)] }),
                  ),
                }),
              ],
            }),
          ],
        },
      ],
    });
    const bytes = new Uint8Array(await Packer.toBuffer(doc));
    const signals = await reader.read(DOCX_MIME, bytes);
    expect(signals).toMatchObject({ format: 'docx', pageCount: null, tableCount: 1 });
    await expect(failing(DOCX_MIME, bytes)).resolves.toEqual(['single_column']);
    expect(evaluateFileCheck(signals!).checks.map((c) => c.id)).not.toContain('length');
  });

  it('outro formato não tem conferência', async () => {
    await expect(reader.read('text/plain', new Uint8Array([1]))).resolves.toBeNull();
  });
});

describe('sideBySideRatio', () => {
  const item = (str: string, x: number, y: number) => ({ str, x, y, width: str.length * 5 });
  it('só linhas longas contam, e um trecho distante na mesma altura vira outra linha', () => {
    const page = {
      width: 600,
      items: [
        item('Uma linha longa de experiência no começo', 50, 700),
        item('2021', 520, 700),
        item('Outra linha longa na coluna da esquerda', 50, 680),
        item('Linha longa que começa no meio da página', 320, 680),
      ],
    };
    expect(sideBySideRatio([page])).toBeCloseTo(1 / 3);
    expect(sideBySideRatio([{ width: 600, items: [] }])).toBe(0);
  });
});
