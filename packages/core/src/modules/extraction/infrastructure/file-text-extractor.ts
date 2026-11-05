import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { AppError } from '../../shared';
import { DOCX_MIME, PDF_MIME } from '../../documents';
import type { TextExtractor } from '../application/ports';

/** Lê o texto de PDFs digitais (unpdf) e de DOCX (mammoth). */
export class FileTextExtractor implements TextExtractor {
  async extract(mimeType: string, bytes: Uint8Array): Promise<string> {
    if (mimeType === PDF_MIME) {
      // O pdf.js pode assumir a posse do buffer: passa uma cópia.
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await extractText(pdf, { mergePages: true });
      return text;
    }
    if (mimeType === DOCX_MIME) {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      return value;
    }
    throw new AppError('VALIDATION_FAILED', 'Tipo de arquivo não suportado.');
  }
}
