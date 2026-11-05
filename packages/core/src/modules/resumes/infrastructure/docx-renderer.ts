import { Document, Footer, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { ResumeRenderer } from '../application/resume-export-service';
import type { ResumeExportModel } from '../domain/export-model';

const heading = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2 });
const line = (text: string) => new Paragraph({ text });
const bold = (text: string) => new Paragraph({ children: [new TextRun({ text, bold: true })] });
const bullet = (text: string) => new Paragraph({ text, bullet: { level: 0 } });

export class DocxResumeRenderer implements ResumeRenderer {
  async render(model: ResumeExportModel): Promise<Uint8Array> {
    const children: Paragraph[] = [];
    if (model.name) children.push(new Paragraph({ text: model.name, heading: HeadingLevel.TITLE }));
    if (model.headline) children.push(line(model.headline));
    if (model.contacts.length) children.push(line(model.contacts.join(' | ')));
    if (model.summary.length) children.push(heading('Resumo'), line(model.summary.join(' ')));
    if (model.experiences.length) {
      children.push(heading('Experiência'));
      for (const experience of model.experiences) {
        children.push(bold(experience.heading));
        const details = [experience.period, experience.location].filter(Boolean).join(' | ');
        if (details) children.push(line(details));
        children.push(...experience.bullets.map(bullet));
      }
    }
    for (const section of model.sections) {
      children.push(heading(section.title), ...section.lines.map(line));
    }

    const doc = new Document({
      creator: 'LinkedIner',
      title: 'Currículo',
      sections: [
        {
          children,
          ...(model.watermark
            ? { footers: { default: new Footer({ children: [line(model.watermark)] }) } }
            : {}),
        },
      ],
    });
    return Packer.toBuffer(doc);
  }
}
