import type { FactData } from '../../profile';
import type { ResumeContent, ResumeItem } from './resume';

export const EXPORT_FORMATS = ['pdf', 'docx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const WATERMARK_TEXT = 'Gerado com LinkedIner, plano gratuito';

export interface ExportOwner {
  name: string | null;
  email: string | null;
  headline: string | null;
  links: string[];
}

export interface ExportSection {
  title: string;
  lines: string[];
}

export interface ExportExperience {
  heading: string;
  period: string | null;
  location: string | null;
  bullets: string[];
}

/** O que vai para o arquivo, sem depender do formato. */
export interface ResumeExportModel {
  name: string | null;
  headline: string | null;
  contacts: string[];
  summary: string[];
  experiences: ExportExperience[];
  sections: ExportSection[];
  watermark: string | null;
}

/** Só frases comprovadas ou confirmadas saem no arquivo. */
const exportable = (items: ResumeItem[]) =>
  items.filter((i) => i.status === 'grounded' || i.status === 'user_confirmed').map((i) => i.text);

const join = (parts: (string | null | undefined)[], separator: string) =>
  parts.filter(Boolean).join(separator);

/** Sem data final, mostra só o início: "atual" seria uma informação que o documento não trouxe. */
const period = (start: string | null | undefined, end: string | null | undefined) =>
  join([start, end], ' - ') || null;

const educationLine = (d: FactData) => {
  const course = join([d.degree, d.field], ', ');
  const when = period(d.startDate, d.endDate);
  return join([course, d.institution, when], ' | ');
};
const certificationLine = (d: FactData) => join([d.name, d.issuer, d.issuedAt], ' | ');
const projectLine = (d: FactData) => join([d.name, d.description, d.url], ' | ');
const languageLine = (d: FactData) => join([d.name, d.level], ': ');

export function toExportModel(
  content: ResumeContent,
  owner: ExportOwner,
  opts: { watermark: boolean },
): ResumeExportModel {
  const sections: ExportSection[] = [
    { title: 'Competências', lines: content.skills.length ? [content.skills.join(', ')] : [] },
    { title: 'Formação', lines: content.education.map(educationLine) },
    { title: 'Certificações', lines: content.certifications.map(certificationLine) },
    { title: 'Projetos', lines: content.projects.map(projectLine) },
    { title: 'Idiomas', lines: content.languages.map(languageLine) },
  ].filter((section) => section.lines.length > 0);

  return {
    name: owner.name,
    headline: owner.headline,
    contacts: [owner.email, ...owner.links].filter((c): c is string => Boolean(c)),
    summary: exportable(content.summary),
    experiences: content.experiences.map((e) => ({
      heading: join([e.title, e.company], ' | '),
      period: period(e.startDate, e.endDate),
      location: e.location,
      bullets: exportable(e.bullets),
    })),
    sections,
    watermark: opts.watermark ? WATERMARK_TEXT : null,
  };
}

/** Quantas frases ainda aguardam a decisão do usuário. */
export function pendingSuggestions(content: ResumeContent): number {
  return [...content.summary, ...content.experiences.flatMap((e) => e.bullets)].filter(
    (i) => i.status === 'suggested',
  ).length;
}
