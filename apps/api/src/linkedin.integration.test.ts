import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { analyzeLinkedinV1, DrizzleAiGenerationLog, FakeAiProvider } from '@linkediner/core/ai';
import { DrizzleDocumentRepository } from '@linkediner/core/documents';
import { FileTextExtractor } from '@linkediner/core/extraction/worker';
import { DrizzleUserReader } from '@linkediner/core/identity';
import {
  AnalyzeLinkedin,
  DrizzleLinkedinAnalysisRepository,
  type AnalysisOutput,
} from '@linkediner/core/linkedin';
import { buildTestPdf } from '@linkediner/core/testing';
import { startTestApp } from './testing/app';

// Perfil fictício. Nenhuma chamada real de IA acontece aqui.
const PDF = buildTestPdf(
  'Analista de Dados | SQL e Python. Reduzi o tempo de relatorios em 40% com automacoes em Python. Competencias: SQL, Python, Power BI. Experiencia na Empresa Ficticia desde 2024, construindo paineis para a area financeira.',
);

const OUTPUT: AnalysisOutput = {
  strengths: ['SQL e Python'],
  improvements: ['Título genérico'],
  missingKeywords: ['ETL'],
  competitivePosition: 'Competitivo para vagas júnior.',
  sections: [
    {
      key: 'headline',
      score: 80,
      analysis: 'Claro.',
      breakdown: [{ criterion: 'Clareza', points: 30, max: 40 }],
      tip: null,
      rewrite: 'Analista de Dados | SQL, Python e Power BI',
      actions: ['Inclua Power BI no título', 'Diga o setor'],
    },
    {
      key: 'about',
      score: 60,
      analysis: 'Curto.',
      breakdown: [],
      tip: 'Abra com o cargo.',
      rewrite: null,
      actions: ['Conte um resultado'],
    },
  ],
};

let t: Awaited<ReturnType<typeof startTestApp>>;
let analyze: AnalyzeLinkedin;

beforeAll(async () => {
  t = await startTestApp();
  const db = t.db.db;
  analyze = new AnalyzeLinkedin({
    analyses: new DrizzleLinkedinAnalysisRepository(db, t.cipher),
    documents: new DrizzleDocumentRepository(db),
    storage: t.storage,
    text: new FileTextExtractor(),
    consents: t.consents,
    users: new DrizzleUserReader(db),
    ai: new FakeAiProvider().respond('analyze_linkedin', () => OUTPUT),
    prompt: analyzeLinkedinV1,
    generations: new DrizzleAiGenerationLog(db, t.cipher),
    quota: t.quota,
    audit: t.audit,
  });
}, 180_000);

afterAll(async () => t?.stop());

beforeEach(() => {
  t.linkedinQueue.jobs.length = 0;
});

async function uploadLinkedinPdf(cookie: string) {
  const req = await t.call(cookie, 'POST', '/v1/documents', {
    kind: 'linkedin_pdf',
    mimeType: 'application/pdf',
    sizeBytes: PDF.byteLength,
  });
  const { document, upload } = req.json();
  await fetch(upload.url, { method: 'PUT', body: PDF, headers: upload.headers });
  await t.call(cookie, 'POST', `/v1/documents/${document.id}/complete`);
  return document.id as string;
}

async function runQueuedAnalyses() {
  for (const job of t.linkedinQueue.jobs.splice(0)) await analyze.run(job, { isLastAttempt: true });
}

describe('análise do LinkedIn', () => {
  it('sem consentimento de IA, não analisa', async () => {
    const cookie = await t.signUp('linkedin-sem-ia@example.com');
    const documentId = await uploadLinkedinPdf(cookie);
    const res = await t.call(cookie, 'POST', '/v1/linkedin-analyses', { documentId });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('CONSENT_REQUIRED');
  });

  it('analisa o PDF, guarda o resultado e o checklist marcado', async () => {
    const cookie = await t.signUp('linkedin-ok@example.com');
    await t.call(cookie, 'PUT', '/v1/me/consents/ai_processing', { granted: true });
    const documentId = await uploadLinkedinPdf(cookie);

    const created = await t.call(cookie, 'POST', '/v1/linkedin-analyses', { documentId });
    expect(created.statusCode).toBe(202);
    expect(created.json()).toMatchObject({ status: 'processing', score: null });
    expect(Object.keys(t.linkedinQueue.jobs[0]!).sort()).toEqual(['analysisId', 'userId']);
    // O mesmo envio não gera uma segunda análise enquanto a primeira roda.
    const again = await t.call(cookie, 'POST', '/v1/linkedin-analyses', { documentId });
    expect(again.json().id).toBe(created.json().id);

    await runQueuedAnalyses();
    const id = created.json().id as string;
    const detail = (await t.call(cookie, 'GET', `/v1/linkedin-analyses/${id}`)).json();
    // (80 × 15 + 60 × 15) / 30 = 70
    expect(detail).toMatchObject({ status: 'ready', score: 70, actionsTotal: 3, actionsDone: 0 });
    expect(detail.result.sections.map((s: { key: string }) => s.key)).toEqual([
      'headline',
      'about',
    ]);
    // Plano gratuito: sem o texto pronto, só o aviso.
    expect(detail.rewritesLocked).toBe(true);
    expect(detail.result.sections[0].rewrite).toBeNull();

    const marked = await t.call(cookie, 'PUT', `/v1/linkedin-analyses/${id}/actions`, {
      doneActions: ['about-1', 'headline-1'],
    });
    expect(marked.json()).toEqual({ doneActions: ['headline-1', 'about-1'] });
    const list = (await t.call(cookie, 'GET', '/v1/linkedin-analyses')).json();
    expect(list).toMatchObject([{ id, score: 70, actionsDone: 2, actionsTotal: 3 }]);

    const unknown = await t.call(cookie, 'PUT', `/v1/linkedin-analyses/${id}/actions`, {
      doneActions: ['inventada'],
    });
    expect(unknown.statusCode).toBe(400);
  });

  it('não deixa ver nem pedir análise de outra pessoa', async () => {
    const ana = await t.signUp('linkedin-ana@example.com');
    await t.call(ana, 'PUT', '/v1/me/consents/ai_processing', { granted: true });
    const documentId = await uploadLinkedinPdf(ana);
    const { id } = (await t.call(ana, 'POST', '/v1/linkedin-analyses', { documentId })).json();

    const bia = await t.signUp('linkedin-bia@example.com');
    await t.call(bia, 'PUT', '/v1/me/consents/ai_processing', { granted: true });
    expect((await t.call(bia, 'GET', `/v1/linkedin-analyses/${id}`)).statusCode).toBe(404);
    expect((await t.call(bia, 'POST', '/v1/linkedin-analyses', { documentId })).statusCode).toBe(
      404,
    );
  });
});
