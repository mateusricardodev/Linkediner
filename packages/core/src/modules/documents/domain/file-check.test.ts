import { describe, expect, it } from 'vitest';
import { evaluateFileCheck, textSignals, type FileSignals } from './file-check';

const good = (): FileSignals => ({
  format: 'pdf',
  pageCount: 1,
  visibleChars: 2000,
  invisibleChars: 0,
  imageOnlyPages: 0,
  imageCount: 0,
  sideBySideRatio: 0,
  tableCount: 0,
  hasEmail: true,
  hasPhone: true,
  hasLinkedin: false,
  unreadableSymbols: 0,
  sections: { experience: true, education: true, skills: true },
});

const failing = (o: Partial<FileSignals>) =>
  evaluateFileCheck({ ...good(), ...o })
    .checks.filter((c) => !c.ok)
    .map((c) => c.id);

describe('evaluateFileCheck', () => {
  it('arquivo bom passa em tudo, sem recomendação', () => {
    const report = evaluateFileCheck(good());
    expect(report).toMatchObject({ passed: 7, total: 7 });
    expect(report.checks.every((c) => c.recommendation === null)).toBe(true);
  });

  it('cada problema vira uma recomendação', () => {
    expect(failing({ invisibleChars: 3000 })).toEqual(['readable_text']);
    expect(failing({ visibleChars: 100 })).toEqual(['readable_text']);
    expect(failing({ sideBySideRatio: 0.5 })).toEqual(['single_column']);
    expect(failing({ hasPhone: false })).toEqual(['contact']);
    expect(failing({ hasPhone: false, hasLinkedin: true })).toEqual([]);
    expect(failing({ imageCount: 2 })).toEqual(['images']);
    expect(failing({ unreadableSymbols: 3 })).toEqual(['symbols']);
    expect(failing({ pageCount: 3 })).toEqual(['length']);
  });

  it('a recomendação diz qual seção falta', () => {
    const report = evaluateFileCheck({
      ...good(),
      sections: { experience: true, education: false, skills: false },
    });
    expect(report.checks.find((c) => c.id === 'sections')?.recommendation).toMatch(
      /Não encontramos Formação, Competências/,
    );
  });
});

describe('textSignals', () => {
  it('acha contato e seções em português e em inglês, sem guardar o texto', () => {
    expect(
      textSignals(
        'Ana Teste\nana@example.com | +55 12 99999-0000\nExperiência Profissional\nFormação Acadêmica\nHabilidades',
      ),
    ).toEqual({
      hasEmail: true,
      hasPhone: true,
      hasLinkedin: false,
      unreadableSymbols: 0,
      sections: { experience: true, education: true, skills: true },
    });
    expect(textSignals('Work history\nEducation\nSkills\nlinkedin.com/in/ana').sections).toEqual({
      experience: true,
      education: true,
      skills: true,
    });
  });

  it('conta os símbolos de fontes de ícones', () => {
    expect(textSignals(' ana@example.com  (12) 3456-7890').unreadableSymbols).toBe(2);
  });
});
