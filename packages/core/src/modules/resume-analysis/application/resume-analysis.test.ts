import { describe, expect, it, vi } from 'vitest';
import { analyzeResumeV1, FakeAiProvider } from '../../ai';
import type { DocumentRecord, FileCheckReport } from '../../documents';
import { AppError } from '../../shared';
import type { AnalysisOutput, ResumeAnalysis } from '../domain/analysis';
import { AnalyzeResume } from './analyze-resume';
import { ResumeAnalysisService } from './resume-analysis-service';

const USER = '0193b2b0-0000-7000-8000-00000000000a';
const DOC = '0193b2b0-0000-7000-8000-0000000000d1';
const ID = '0193b2b0-0000-7000-8000-0000000000a1';

const RESUME = `Carla Exemplo
carla@example.com
Resumo
Analista de dados com foco em BI.
Experiência
Empresa Fictícia, Analista de Dados, 2024 a hoje
- Construí painéis em Power BI para a área financeira.
Formação
Universidade Exemplo, Estatística
Competências
SQL, Python, Power BI`;

const FILE_CHECK: FileCheckReport = {
  version: '1',
  passed: 3,
  total: 4,
  checks: [
    { id: 'readable_text', ok: true, label: 'Texto legível', recommendation: null },
    { id: 'single_column', ok: false, label: 'Uma coluna', recommendation: 'Use uma coluna só.' },
    { id: 'contact', ok: true, label: 'Contato', recommendation: null },
    { id: 'length', ok: true, label: 'Até 2 páginas', recommendation: null },
  ],
};

const document = (o: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: DOC,
  kind: 'resume',
  status: 'processed',
  objectKey: 'users/u/documents/d',
  mimeType: 'application/pdf',
  sizeBytes: 100,
  sha256: 'x',
  failureCode: null,
  discardedFacts: 0,
  droppedFields: 0,
  fileCheck: FILE_CHECK,
  uploadedAt: new Date(),
  expiresAt: new Date(),
  createdAt: new Date(),
  ...o,
});

const analysis = (o: Partial<ResumeAnalysis> = {}): ResumeAnalysis => ({
  id: ID,
  documentId: DOC,
  status: 'processing',
  failureCode: null,
  targetRole: 'Analista de Dados',
  result: null,
  doneActions: [],
  createdAt: new Date(),
  ...o,
});

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
      actions: ['Diga o cargo que você busca no resumo'],
    },
    {
      key: 'experience',
      score: 70,
      analysis: 'Boa ordem.',
      breakdown: [],
      tip: null,
      actions: [],
    },
  ],
};

interface SavedResult {
  score: number;
  sections: { key: string; score: number; actions: { id: string; text: string }[] }[];
}

function worker(
  o: {
    analysis?: ResumeAnalysis | null;
    doc?: DocumentRecord | null;
    consent?: boolean;
    fails?: boolean;
  } = {},
) {
  const saveReady = vi.fn(async (_u: string, _id: string, _r: SavedResult) => {});
  const markFailed = vi.fn(async () => {});
  const refund = vi.fn(async () => {});
  const inputs: Record<string, unknown>[] = [];
  const ai = new FakeAiProvider().respond('analyze_resume', (req) => {
    inputs.push(req.promptInput);
    if (o.fails) throw new AppError('DEPENDENCY_UNAVAILABLE', 'fora do ar');
    return OUTPUT;
  });
  const use = new AnalyzeResume({
    analyses: {
      find: async () => (o.analysis === undefined ? analysis() : o.analysis),
      saveReady,
      markFailed,
    },
    documents: { find: async () => (o.doc === undefined ? document() : o.doc) },
    storage: { getBytes: async () => new Uint8Array([1]) },
    text: { extract: async () => RESUME },
    consents: {
      status: async () => ({
        granted: { ai_processing: o.consent ?? true } as never,
        missingRequired: [],
      }),
    },
    users: { getById: async () => ({ name: 'Carla Exemplo' }) },
    ai,
    prompt: analyzeResumeV1,
    generations: { record: async () => {} },
    quota: { refund },
    audit: { record: async () => {} },
  });
  const saved = () => saveReady.mock.calls[0]![2];
  return { use, saved, markFailed, refund, inputs };
}

const job = { userId: USER, analysisId: ID };

describe('AnalyzeResume', () => {
  it('junta a conferência ATS às seções da IA e calcula a nota pelos pesos', async () => {
    const w = worker();
    await expect(w.use.run(job, { isLastAttempt: false })).resolves.toBe('ready');
    const result = w.saved();
    expect(result.sections.map((s) => [s.key, s.score])).toEqual([
      ['ats', 75],
      ['summary', 60],
      ['experience', 70],
    ]);
    // (75 × 15 + 60 × 10 + 70 × 25) / 50 = 69,5
    expect(result.score).toBe(70);
    expect(result.sections[0]?.actions).toEqual([{ id: 'ats-1', text: 'Use uma coluna só.' }]);
    expect(w.refund).not.toHaveBeenCalled();
  });

  it('envia o texto para a IA sem o e-mail', async () => {
    const w = worker();
    await w.use.run(job, { isLastAttempt: false });
    expect(String(w.inputs[0]?.resumeText)).not.toContain('carla@example.com');
  });

  it('sem a conferência do arquivo, a nota vem só das seções da IA', async () => {
    const w = worker({ doc: document({ fileCheck: null }) });
    await w.use.run(job, { isLastAttempt: false });
    const result = w.saved();
    expect(result.sections.map((s) => s.key)).toEqual(['summary', 'experience']);
    // (60 × 10 + 70 × 25) / 35 = 67,1
    expect(result.score).toBe(67);
  });

  it('sem o documento ou sem consentimento, falha e devolve o limite', async () => {
    const noDoc = worker({ doc: null });
    await expect(noDoc.use.run(job, { isLastAttempt: false })).resolves.toBe('failed');
    expect(noDoc.markFailed).toHaveBeenCalledWith(USER, ID, 'document_missing');
    expect(noDoc.refund).toHaveBeenCalled();
    const noConsent = worker({ consent: false });
    await expect(noConsent.use.run(job, { isLastAttempt: false })).resolves.toBe('failed');
    expect(noConsent.markFailed).toHaveBeenCalledWith(USER, ID, 'consent_revoked');
  });

  it('erro da IA sobe para a fila, e só a última tentativa marca a falha', async () => {
    const first = worker({ fails: true });
    await expect(first.use.run(job, { isLastAttempt: false })).rejects.toThrow('fora do ar');
    expect(first.markFailed).not.toHaveBeenCalled();
    const last = worker({ fails: true });
    await expect(last.use.run(job, { isLastAttempt: true })).rejects.toThrow('fora do ar');
    expect(last.markFailed).toHaveBeenCalledWith(USER, ID, 'processing_error');
    expect(last.refund).toHaveBeenCalled();
  });

  it('análise que já terminou não roda de novo', async () => {
    const w = worker({ analysis: analysis({ status: 'ready' }) });
    await expect(w.use.run(job, { isLastAttempt: false })).resolves.toBe('skipped');
  });
});

function service(o: { doc?: DocumentRecord | null; existing?: ResumeAnalysis[] } = {}) {
  const enqueue = vi.fn(async () => {});
  const consume = vi.fn(async () => {});
  const insertProcessing = vi.fn(
    async (_u: string, a: { id: string; documentId: string; targetRole: string | null }) =>
      analysis({ ...a }),
  );
  const svc = new ResumeAnalysisService({
    repo: {
      insertProcessing,
      find: async () => null,
      list: async () => o.existing ?? [],
      saveReady: async () => {},
      markFailed: async () => {},
      setDoneActions: async () => {},
    },
    documents: { find: async () => (o.doc === undefined ? document() : o.doc) },
    goals: {
      listGoals: async () => [{ id: 'g1', title: 'Analista de Dados', isActive: true } as never],
    },
    consents: {
      status: async () => ({ granted: { ai_processing: true } as never, missingRequired: [] }),
    },
    queue: { enqueue },
    quota: { consume, refund: async () => {} },
    audit: { record: async () => {} },
  });
  return { svc, enqueue, consume, insertProcessing };
}

describe('ResumeAnalysisService', () => {
  it('pede a análise com o cargo do objetivo ativo e gasta o limite uma vez', async () => {
    const s = service();
    await s.svc.request(USER, DOC);
    expect(s.consume).toHaveBeenCalledWith(USER, 'resume.analysis', expect.any(String));
    expect(s.insertProcessing).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ documentId: DOC, targetRole: 'Analista de Dados' }),
    );
    expect(s.enqueue).toHaveBeenCalledTimes(1);
  });

  it('recusa o PDF do LinkedIn e repete a análise em andamento', async () => {
    await expect(
      service({ doc: document({ kind: 'linkedin_pdf' }) }).svc.request(USER, DOC),
    ).rejects.toThrow(/arquivo do seu currículo/);
    const running = analysis();
    const s = service({ existing: [running] });
    await expect(s.svc.request(USER, DOC)).resolves.toBe(running);
    expect(s.consume).not.toHaveBeenCalled();
  });

  it('não encontra análise de outra pessoa', async () => {
    await expect(service().svc.get(USER, ID)).rejects.toThrow(/não encontrada/);
  });
});
