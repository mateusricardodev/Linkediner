import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { analyzeResumeV1, DrizzleAiGenerationLog, FakeAiProvider } from '@linkediner/core/ai';
import { DrizzleDocumentRepository } from '@linkediner/core/documents';
import { FileTextExtractor } from '@linkediner/core/extraction/worker';
import { DrizzleUserReader } from '@linkediner/core/identity';
import {
  AnalyzeResume,
  DrizzleResumeAnalysisRepository,
  SECTION_WEIGHTS,
  type AnalysisOutput,
  type SectionKey,
} from '@linkediner/core/resume-analysis';
import { buildTestPdf } from '@linkediner/core/testing';
import { startTestApp } from './testing/app';

// Currículo fictício. Nenhuma chamada real de IA acontece aqui.
const PDF = buildTestPdf(
  'Carla Exemplo. carla@example.com. (11) 90000-0000. Resumo: Analista de Dados com foco em BI. Experiencia: Analista de Dados na Empresa Ficticia desde 2024, construindo paineis em Power BI para a area financeira e automatizando relatorios com Python. Formacao: Estatistica na Universidade Exemplo. Competencias: SQL, Python, Power BI.',
);

const OUTPUT: AnalysisOutput = {
  strengths: ['SQL e Python'],
  improvements: ['Sem resultados medidos'],
  missingKeywords: ['ETL'],
  competitivePosition: 'Competitivo para vagas júnior.',
  sections: [
    {
      key: 'summary',
      score: 60,
      analysis: 'Curto.',
      breakdown: [{ criterion: 'Clareza', points: 30, max: 50 }],
      tip: null,
      actions: ['Diga o cargo que você busca', 'Cite a sua área'],
    },
    {
      key: 'results',
      score: 40,
      analysis: 'Sem números.',
      breakdown: [],
      tip: 'Mostre o efeito do seu trabalho.',
      actions: ['Acrescente um resultado medido, se ele existir'],
    },
  ],
};

let t: Awaited<ReturnType<typeof startTestApp>>;
let analyze: AnalyzeResume;

beforeAll(async () => {
  t = await startTestApp();
  const db = t.db.db;
  analyze = new AnalyzeResume({
    analyses: new DrizzleResumeAnalysisRepository(db, t.cipher),
    documents: new DrizzleDocumentRepository(db),
    storage: t.storage,
    text: new FileTextExtractor(),
    consents: t.consents,
    users: new DrizzleUserReader(db),
    ai: new FakeAiProvider().respond('analyze_resume', () => OUTPUT),
    prompt: analyzeResumeV1,
    generations: new DrizzleAiGenerationLog(db, t.cipher),
    quota: t.quota,
    audit: t.audit,
  });
}, 180_000);

afterAll(async () => t?.stop());

beforeEach(() => {
  t.resumeAnalysisQueue.jobs.length = 0;
});

async function uploadResume(cookie: string, kind: 'resume' | 'linkedin_pdf' = 'resume') {
  const req = await t.call(cookie, 'POST', '/v1/documents', {
    kind,
    mimeType: 'application/pdf',
    sizeBytes: PDF.byteLength,
  });
  const { document, upload } = req.json();
  await fetch(upload.url, { method: 'PUT', body: PDF, headers: upload.headers });
  await t.call(cookie, 'POST', `/v1/documents/${document.id}/complete`);
  return document.id as string;
}

async function runQueuedAnalyses() {
  for (const job of t.resumeAnalysisQueue.jobs.splice(0)) {
    await analyze.run(job, { isLastAttempt: true });
  }
}

describe('análise de currículo', () => {
  it('sem consentimento de IA, não analisa', async () => {
    const cookie = await t.signUp('cv-sem-ia@example.com');
    const documentId = await uploadResume(cookie);
    const res = await t.call(cookie, 'POST', '/v1/resume-analyses', { documentId });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('CONSENT_REQUIRED');
  });

  it('analisa o currículo com a conferência ATS e guarda o checklist marcado', async () => {
    const cookie = await t.signUp('cv-ok@example.com');
    await t.call(cookie, 'PUT', '/v1/me/consents/ai_processing', { granted: true });
    const documentId = await uploadResume(cookie);

    const created = await t.call(cookie, 'POST', '/v1/resume-analyses', { documentId });
    expect(created.statusCode).toBe(202);
    expect(created.json()).toMatchObject({ status: 'processing', score: null });
    expect(Object.keys(t.resumeAnalysisQueue.jobs[0]!).sort()).toEqual(['analysisId', 'userId']);
    const again = await t.call(cookie, 'POST', '/v1/resume-analyses', { documentId });
    expect(again.json().id).toBe(created.json().id);

    await runQueuedAnalyses();
    const id = created.json().id as string;
    const detail = (await t.call(cookie, 'GET', `/v1/resume-analyses/${id}`)).json();
    expect(detail.status).toBe('ready');
    const sections = detail.result.sections as { key: SectionKey; score: number }[];
    // A conferência do arquivo entra como a primeira seção, sem IA.
    expect(sections.map((s) => s.key)).toEqual(['ats', 'summary', 'results']);
    const weight = sections.reduce((n, s) => n + SECTION_WEIGHTS[s.key], 0);
    const expected = Math.round(
      sections.reduce((n, s) => n + s.score * SECTION_WEIGHTS[s.key], 0) / weight,
    );
    expect(detail.score).toBe(expected);

    const marked = await t.call(cookie, 'PUT', `/v1/resume-analyses/${id}/actions`, {
      doneActions: ['results-1', 'summary-1'],
    });
    expect(marked.json()).toEqual({ doneActions: ['summary-1', 'results-1'] });
    const list = (await t.call(cookie, 'GET', '/v1/resume-analyses')).json();
    expect(list).toMatchObject([{ id, score: expected, actionsDone: 2 }]);

    const unknown = await t.call(cookie, 'PUT', `/v1/resume-analyses/${id}/actions`, {
      doneActions: ['inventada'],
    });
    expect(unknown.statusCode).toBe(400);
  });

  it('recusa o PDF do LinkedIn e não deixa ver análise de outra pessoa', async () => {
    const ana = await t.signUp('cv-ana@example.com');
    await t.call(ana, 'PUT', '/v1/me/consents/ai_processing', { granted: true });
    const linkedin = await uploadResume(ana, 'linkedin_pdf');
    const wrongKind = await t.call(ana, 'POST', '/v1/resume-analyses', { documentId: linkedin });
    expect(wrongKind.statusCode).toBe(400);

    const documentId = await uploadResume(ana);
    const { id } = (await t.call(ana, 'POST', '/v1/resume-analyses', { documentId })).json();
    const bia = await t.signUp('cv-bia@example.com');
    await t.call(bia, 'PUT', '/v1/me/consents/ai_processing', { granted: true });
    expect((await t.call(bia, 'GET', `/v1/resume-analyses/${id}`)).statusCode).toBe(404);
    expect((await t.call(bia, 'POST', '/v1/resume-analyses', { documentId })).statusCode).toBe(404);
  });
});
