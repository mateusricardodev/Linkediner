import PDFDocument from 'pdfkit';
import type { ResumeRenderer } from '../application/resume-export-service';
import type { ResumeExportModel } from '../domain/export-model';

const MARGIN = 54;
const REGULAR = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const WINANSI_EXTRAS = new Set('–—‘’“”•€');

/**
 * As fontes padrão do PDF cobrem português e outras línguas ocidentais (WinAnsi).
 * Fora disso, como emojis, o caractere sairia trocado por outro: melhor removê-lo.
 */
const printable = (text: string) =>
  [...text]
    .filter((char) => {
      const code = char.codePointAt(0)!;
      const ascii = code >= 32 && code <= 126;
      const latin1 = code >= 160 && code <= 255;
      return ascii || latin1 || code === 10 || WINANSI_EXTRAS.has(char);
    })
    .join('');

/** PDF em uma coluna e com texto selecionável, o formato que os sistemas de recrutamento leem melhor. */
export class PdfResumeRenderer implements ResumeRenderer {
  render(model: ResumeExportModel): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: MARGIN,
        info: { Title: 'Currículo', Producer: 'LinkedIner', Creator: 'LinkedIner' },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const heading = (title: string) => {
        doc.moveDown(0.8).font(BOLD).fontSize(12).fillColor('#000000').text(printable(title));
        doc.moveDown(0.2);
      };
      const body = (text: string) =>
        doc.font(REGULAR).fontSize(10).fillColor('#222222').text(printable(text), { lineGap: 2 });
      const bullet = (text: string) =>
        doc
          .font(REGULAR)
          .fontSize(10)
          .fillColor('#222222')
          .text(`• ${printable(text)}`, { indent: 8, lineGap: 2 });

      if (model.name) doc.font(BOLD).fontSize(20).text(printable(model.name));
      if (model.headline) doc.font(REGULAR).fontSize(12).text(printable(model.headline));
      if (model.contacts.length) {
        doc.moveDown(0.2);
        body(model.contacts.join(' | '));
      }
      if (model.summary.length) {
        heading('Resumo');
        body(model.summary.join(' '));
      }
      if (model.experiences.length) {
        heading('Experiência');
        for (const experience of model.experiences) {
          doc.font(BOLD).fontSize(10).fillColor('#000000').text(printable(experience.heading));
          const details = [experience.period, experience.location].filter(Boolean).join(' | ');
          if (details) body(details);
          experience.bullets.forEach(bullet);
          doc.moveDown(0.4);
        }
      }
      for (const section of model.sections) {
        heading(section.title);
        section.lines.forEach(body);
      }
      if (model.watermark) {
        doc.moveDown(1.5);
        doc.font(REGULAR).fontSize(8).fillColor('#777777').text(printable(model.watermark), {
          align: 'center',
        });
      }
      doc.end();
    });
  }
}
