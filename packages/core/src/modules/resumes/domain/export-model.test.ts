import { describe, expect, it } from 'vitest';
import { toExportModel } from './export-model';
import type { ResumeContent } from './resume';

const content: ResumeContent = {
  summary: [
    { id: 's', text: 'Backend engineer.', factIds: ['e'], status: 'grounded', reason: null },
  ],
  experiences: [],
  skills: ['Go'],
  education: [],
  certifications: [],
  projects: [],
  languages: [{ name: 'Português', level: 'Nativo' }],
};
const owner = { name: 'Ana Teste', email: null, headline: null, links: [] };

describe('toExportModel', () => {
  it('escreve os títulos das seções no idioma do currículo', () => {
    const en = toExportModel(content, owner, { watermark: false, language: 'en' });
    expect(en.titles).toEqual({ summary: 'Summary', experience: 'Experience' });
    expect(en.sections.map((s) => s.title)).toEqual(['Skills', 'Languages']);
    const pt = toExportModel(content, owner, { watermark: false });
    expect(pt.sections.map((s) => s.title)).toEqual(['Competências', 'Idiomas']);
  });
});
