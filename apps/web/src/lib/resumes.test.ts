import { describe, expect, it } from 'vitest';
import {
  formatPeriod,
  pendingCount,
  previousScore,
  resumeFailureMessage,
  restoreDecision,
  SECTION_LINES,
} from './resumes';
import type { ResumeContent, ResumeItem } from './types';

const item = (status: ResumeItem['status'], reason: ResumeItem['reason'] = null): ResumeItem => ({
  id: status,
  text: 'Frase',
  factIds: [],
  status,
  reason,
});

const content = (summary: ResumeItem[], bullets: ResumeItem[]): ResumeContent => ({
  summary,
  experiences: [
    {
      factId: 'f',
      company: null,
      title: null,
      startDate: null,
      endDate: null,
      location: null,
      bullets,
    },
  ],
  skills: [],
  education: [],
  certifications: [],
  projects: [],
  languages: [],
});

describe('pendingCount', () => {
  it('conta só as sugestões, no resumo e nas experiências', () => {
    expect(
      pendingCount(
        content(
          [item('suggested', 'no_source'), item('grounded')],
          [item('suggested', 'unsupported_value'), item('removed', 'no_source')],
        ),
      ),
    ).toBe(2);
    expect(pendingCount(content([item('user_confirmed')], []))).toBe(0);
  });
});

describe('restoreDecision', () => {
  it('sugestão restaurada leva o texto, para virar fato confirmado', () => {
    expect(restoreDecision(item('removed', 'no_source'))).toEqual({
      action: 'confirm',
      text: 'Frase',
    });
  });

  it('frase comprovada volta sem criar um fato novo', () => {
    expect(restoreDecision(item('removed'))).toEqual({ action: 'confirm' });
  });
});

describe('textos', () => {
  it('não inventa data final', () => {
    expect(formatPeriod('2020', null)).toBe('2020');
    expect(formatPeriod('2020', '2022')).toBe('2020 – 2022');
    expect(formatPeriod(null, null)).toBe('');
  });

  it('monta as linhas sem separadores sobrando', () => {
    expect(SECTION_LINES.languages({ name: 'Inglês', level: null })).toBe('Inglês');
    expect(
      SECTION_LINES.education({
        degree: 'Bacharelado',
        field: 'Computação',
        institution: 'USP',
        startDate: null,
        endDate: '2019',
      }),
    ).toBe('Bacharelado, Computação · USP · 2019');
  });

  it('explica a falha, inclusive para um motivo desconhecido', () => {
    expect(resumeFailureMessage('no_facts')).toMatch(/Envie um documento/);
    expect(resumeFailureMessage('novo')).toBe(resumeFailureMessage('processing_error'));
  });
});

describe('previousScore', () => {
  it('acha o anterior em qualquer ordem', () => {
    const older = { score: 40, calculatedAt: '2026-11-01T00:00:00.000Z' };
    const newer = { score: 60, calculatedAt: '2026-11-07T00:00:00.000Z' };
    expect(previousScore([older, newer])).toEqual(older);
    expect(previousScore([newer, older])).toEqual(older);
  });

  it('sem histórico não há comparação', () => {
    expect(previousScore([{ score: 40, calculatedAt: '2026-11-01T00:00:00.000Z' }])).toBeNull();
    expect(previousScore([])).toBeNull();
  });
});
