import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { describe, expect, it } from 'vitest';
import { toExportModel, WATERMARK_TEXT, type ResumeExportModel } from '../domain/export-model';
import type { ResumeContent } from '../domain/resume';
import { DocxResumeRenderer } from './docx-renderer';
import { PdfResumeRenderer } from './pdf-renderer';

const item = (
  id: string,
  text: string,
  status: 'grounded' | 'suggested' | 'user_confirmed' | 'removed',
) => ({
  id,
  text,
  factIds: ['e1'],
  status,
  reason: null,
});

const content: ResumeContent = {
  summary: [item('s1', 'Engenheira com foco em acessibilidade', 'grounded')],
  experiences: [
    {
      factId: 'e1',
      company: 'Nubank',
      title: 'Engenheira Frontend',
      startDate: 'jan 2021',
      endDate: null,
      location: 'São Paulo',
      bullets: [
        item('b1', 'Reduzi o build em 40%', 'grounded'),
        item('b2', 'Confirmado pela usuária', 'user_confirmed'),
        item('b3', 'Frase removida', 'removed'),
        item('b4', 'Sugestão pendente', 'suggested'),
      ],
    },
  ],
  skills: ['TypeScript', 'React'],
  education: [
    {
      institution: 'USP',
      degree: 'Bacharelado',
      field: 'Ciência da Computação',
      startDate: null,
      endDate: '2019',
    },
  ],
  certifications: [],
  projects: [{ name: 'Painel', description: null, url: null }],
  languages: [{ name: 'Inglês', level: 'avançado' }],
};

const owner = {
  name: 'Ana Fictícia',
  email: 'ana@example.com',
  headline: 'Engenheira de Software',
  links: ['https://github.com/ana'],
};
const model = (watermark = false): ResumeExportModel =>
  toExportModel(content, owner, { watermark });

const pdfText = async (bytes: Uint8Array) => {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  return (await extractText(pdf, { mergePages: true })).text;
};
const docxText = async (bytes: Uint8Array) =>
  (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;

describe('toExportModel', () => {
  it('só leva frases comprovadas ou confirmadas', () => {
    expect(model().experiences[0]!.bullets).toEqual([
      'Reduzi o build em 40%',
      'Confirmado pela usuária',
    ]);
  });

  it('sem data final, mostra só o início e não inventa "atual"', () => {
    expect(model().experiences[0]!.period).toBe('jan 2021');
  });

  it('omite seções vazias', () => {
    expect(model().sections.map((s) => s.title)).toEqual([
      'Competências',
      'Formação',
      'Projetos',
      'Idiomas',
    ]);
  });

  it('marca d’água só quando pedida', () => {
    expect(model(true).watermark).toBe(WATERMARK_TEXT);
    expect(model(false).watermark).toBeNull();
  });
});

describe.each([
  ['PDF', new PdfResumeRenderer(), pdfText],
  ['DOCX', new DocxResumeRenderer(), docxText],
])('%s', (_name, renderer, read) => {
  it('gera arquivo legível, com acentos e sem o que não foi aprovado', async () => {
    const text = await read(await renderer.render(model()));
    for (const expected of [
      'Ana Fictícia',
      'ana@example.com',
      'https://github.com/ana',
      'Engenheira Frontend',
      'Nubank',
      'São Paulo',
      'Reduzi o build em 40%',
      'Confirmado pela usuária',
      'Ciência da Computação',
      'Inglês: avançado',
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain('Frase removida');
    expect(text).not.toContain('Sugestão pendente');
    expect(text).not.toContain(WATERMARK_TEXT);
  });

  it('inclui a marca d’água quando pedida', async () => {
    const bytes = await renderer.render(model(true));
    if (renderer instanceof PdfResumeRenderer) {
      expect(await read(bytes)).toContain(WATERMARK_TEXT);
    } else {
      // O rodapé do DOCX fica fora do corpo do documento, em word/footer*.xml.
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(bytes);
      const footers = Object.keys(zip.files).filter((f) => /word\/footer\d*\.xml/.test(f));
      const xml = await Promise.all(footers.map((f) => zip.file(f)!.async('string')));
      expect(xml.join('')).toContain(WATERMARK_TEXT);
    }
  });

  it('não quebra com perfil mínimo nem com emoji', async () => {
    const minimal = toExportModel(
      { ...content, summary: [item('s', 'Foco em qualidade 🚀', 'grounded')], experiences: [] },
      { name: null, email: null, headline: null, links: [] },
      { watermark: false },
    );
    expect(await read(await renderer.render(minimal))).toContain('Foco em qualidade');
  });
});
