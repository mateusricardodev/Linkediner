import mammoth from 'mammoth';
import { extractText, extractTextItems, getDocumentProxy, inspectPages } from 'unpdf';
import { DOCX_MIME, PDF_MIME } from '../domain/document';
import { textSignals, type FileSignals } from '../domain/file-check';

/** Página com menos texto que isso e quase toda coberta por imagem é uma página escaneada. */
const IMAGE_PAGE_MAX_CHARS = 80;
const IMAGE_PAGE_MIN_COVERAGE = 0.5;
/** Linha curta, como uma data alinhada à direita, não indica coluna. */
const LONG_LINE_CHARS = 25;
/** Um trecho que começa depois disso, na largura da página, está numa segunda coluna. */
const SECOND_COLUMN_START = 0.35;
/** Espaço entre dois trechos da mesma altura que separa colunas. */
const COLUMN_GAP = 0.05;

interface Item {
  str: string;
  x: number;
  y: number;
  width: number;
}

/**
 * Fração das linhas longas que começam no meio da página. Trechos na mesma altura, separados por um
 * espaço grande, contam como linhas diferentes: é assim que duas colunas aparecem no PDF.
 */
export function sideBySideRatio(pages: { width: number; items: Item[] }[]): number {
  let long = 0;
  let shifted = 0;
  for (const { width, items } of pages) {
    const rows = new Map<number, Item[]>();
    for (const item of items) {
      if (!item.str.trim()) continue;
      const key = Math.round(item.y / 3);
      rows.set(key, [...(rows.get(key) ?? []), item]);
    }
    for (const row of rows.values()) {
      row.sort((a, b) => a.x - b.x);
      let segment: Item[] = [];
      const close = () => {
        const chars = segment.reduce((total, item) => total + item.str.trim().length, 0);
        if (chars >= LONG_LINE_CHARS) {
          long++;
          if (segment[0]!.x > width * SECOND_COLUMN_START) shifted++;
        }
        segment = [];
      };
      for (const item of row) {
        const previous = segment.at(-1);
        if (previous && item.x - (previous.x + previous.width) > width * COLUMN_GAP) close();
        segment.push(item);
      }
      close();
    }
  }
  return long === 0 ? 0 : shifted / long;
}

/** Mede o arquivo como um ATS o leria. Só sinais: o texto lido não sai daqui. */
export class FileSignalsReader {
  async read(mimeType: string, bytes: Uint8Array): Promise<FileSignals | null> {
    if (mimeType === PDF_MIME) return this.pdf(bytes);
    if (mimeType === DOCX_MIME) return this.docx(bytes);
    return null;
  }

  private async pdf(bytes: Uint8Array): Promise<FileSignals> {
    // O pdf.js pode assumir a posse do buffer: passa uma cópia.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const [{ pages }, { items }, { text }] = await Promise.all([
      inspectPages(pdf),
      extractTextItems(pdf),
      extractText(pdf, { mergePages: true }),
    ]);
    const widths = await Promise.all(
      pages.map(async (_, index) => (await pdf.getPage(index + 1)).getViewport({ scale: 1 }).width),
    );
    const visible = pages.reduce((sum, p) => sum + p.textLength - p.invisibleTextLength, 0);
    return {
      format: 'pdf',
      pageCount: pages.length,
      visibleChars: visible,
      invisibleChars: pages.reduce((sum, p) => sum + p.invisibleTextLength, 0),
      imageOnlyPages: pages.filter(
        (p) =>
          p.textLength - p.invisibleTextLength < IMAGE_PAGE_MAX_CHARS &&
          p.imageCoverage >= IMAGE_PAGE_MIN_COVERAGE,
      ).length,
      imageCount: pages.reduce((sum, p) => sum + p.imageCount, 0),
      sideBySideRatio: sideBySideRatio(
        items.map((pageItems, index) => ({ width: widths[index] ?? 595, items: pageItems })),
      ),
      tableCount: 0,
      ...textSignals(text),
    };
  }

  private async docx(bytes: Uint8Array): Promise<FileSignals> {
    const buffer = Buffer.from(bytes);
    const [{ value: text }, { value: html }] = await Promise.all([
      mammoth.extractRawText({ buffer }),
      mammoth.convertToHtml({ buffer }),
    ]);
    return {
      format: 'docx',
      // O DOCX não tem páginas fixas: depende de como é aberto.
      pageCount: null,
      visibleChars: text.replace(/\s/g, '').length,
      invisibleChars: 0,
      imageOnlyPages: 0,
      imageCount: (html.match(/<img\b/g) ?? []).length,
      sideBySideRatio: 0,
      tableCount: (html.match(/<table\b/g) ?? []).length,
      ...textSignals(text),
    };
  }
}
