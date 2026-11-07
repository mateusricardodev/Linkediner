import { describe, expect, it } from 'vitest';
import {
  hiddenJobs,
  hidesJob,
  isNewPosting,
  jobMeta,
  postedLabel,
  safeExternalUrl,
  sourceLabel,
  toggleReason,
} from './jobs';
import type { Job, Recommendations } from './types';

const job = (id: string, status: Job['status'] = 'ready') => ({ id, status }) as Job;
const recommendations = (ids: string[]) =>
  ({ items: ids.map((id) => ({ job: job(id) })), hidden: 0, disclaimer: '' }) as Recommendations;

describe('toggleReason', () => {
  it('marca e desmarca', () => {
    expect(toggleReason([], 'liked')).toEqual(['liked']);
    expect(toggleReason(['liked'], 'liked')).toEqual([]);
  });

  it('nunca junta elogio e recusa, que a API recusaria', () => {
    expect(toggleReason(['disliked', 'too_senior'], 'liked')).toEqual(['liked']);
    expect(toggleReason(['liked', 'more_like_this'], 'disliked')).toEqual(['disliked']);
  });

  it('acumula motivos do mesmo lado', () => {
    expect(toggleReason(['too_senior'], 'tech_mismatch')).toEqual(['too_senior', 'tech_mismatch']);
  });

  it('já ter se candidatado não contradiz nada', () => {
    expect(toggleReason(['liked'], 'already_applied')).toEqual(['liked', 'already_applied']);
    expect(toggleReason(['already_applied'], 'liked')).toEqual(['already_applied', 'liked']);
    expect(toggleReason(['already_applied'], 'disliked')).toEqual(['already_applied', 'disliked']);
  });
});

describe('hidesJob', () => {
  it('só elogio mantém a vaga na lista', () => {
    expect(hidesJob([])).toBe(false);
    expect(hidesJob(['liked', 'more_like_this'])).toBe(false);
    expect(hidesJob(['already_applied'])).toBe(true);
    expect(hidesJob(['tech_mismatch'])).toBe(true);
  });
});

describe('hiddenJobs', () => {
  it('acha as prontas fora das recomendações, ignorando as em análise', () => {
    const jobs = [job('a'), job('b'), job('c', 'structuring'), job('d', 'failed')];
    expect(hiddenJobs(jobs, recommendations(['a'])).map((j) => j.id)).toEqual(['b']);
  });
});

describe('safeExternalUrl', () => {
  it('só aceita HTTPS', () => {
    expect(safeExternalUrl('https://vagas.example/1')).toBe('https://vagas.example/1');
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('http://vagas.example/1')).toBeNull();
    expect(safeExternalUrl('não é link')).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});

describe('data de publicação', () => {
  const now = new Date('2026-11-07T12:00:00.000Z').getTime();

  it('fala em português, sem inventar data', () => {
    expect(postedLabel('2026-11-07T08:00:00.000Z', now)).toBe('Publicada hoje');
    expect(postedLabel('2026-11-06T08:00:00.000Z', now)).toBe('Publicada ontem');
    expect(postedLabel('2026-11-01T08:00:00.000Z', now)).toBe('Publicada há 6 dias');
    expect(postedLabel(null, now)).toBeNull();
  });

  it('marca como nova só na primeira semana', () => {
    expect(isNewPosting('2026-11-01T08:00:00.000Z', now)).toBe(true);
    expect(isNewPosting('2026-10-30T08:00:00.000Z', now)).toBe(false);
    expect(isNewPosting(null, now)).toBe(false);
  });

  it('dá nome às fontes conhecidas', () => {
    expect(sourceLabel('lever')).toBe('Lever');
    expect(sourceLabel('outra')).toBe('outra');
  });
});

describe('jobMeta', () => {
  it('omite o que a vaga não informa', () => {
    expect(
      jobMeta({
        company: 'Acme',
        location: null,
        remotePolicy: 'unknown',
        seniority: 'senior',
      } as Job),
    ).toBe('Acme · Sênior');
  });
});
