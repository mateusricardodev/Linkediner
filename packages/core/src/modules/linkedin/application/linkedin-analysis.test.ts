import { describe, expect, it, vi } from 'vitest';
import { analyzeLinkedinV1, FakeAiProvider } from '../../ai';
import type { AuditEntry } from '../../audit';
import type { DocumentRecord } from '../../documents';
import { AppError } from '../../shared';
import type { AnalysisOutput, LinkedinAnalysis } from '../domain/analysis';
import { AnalyzeLinkedin } from './analyze-linkedin';
import { LinkedinAnalysisService } from './linkedin-analysis-service';

const USER = '0193b2b0-0000-7000-8000-00000000000a';
const DOC = '0193b2b0-0000-7000-8000-0000000000d1';
const ID = '0193b2b0-0000-7000-8000-0000000000a1';

const PROFILE = `Carla Exemplo
Analista de Dados | SQL e Python
São Paulo, Brasil
Resumo
Analista de dados com foco em BI. Reduzi o tempo de relatórios em 40%.
Experiência
Empresa Fictícia
Analista de Dados
janeiro de 2024 - Present
Construí painéis em Power BI para a área financeira e automatizei relatórios com Python.`;

const document = (o: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: DOC,
  kind: 'linkedin_pdf',
  status: 'processed',
  objectKey: 'users/u/documents/d',
  mimeType: 'application/pdf',
  sizeBytes: 100,
  sha256: 'x',
  failureCode: null,
  discardedFacts: 0,
  droppedFields: 0,
  fileCheck: null,
  uploadedAt: new Date(),
  expiresAt: new Date(),
  createdAt: new Date(),
  ...o,
});

const analysis = (o: Partial<LinkedinAnalysis> = {}): LinkedinAnalysis => ({
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
  improvements: ['Título genérico'],
  missingKeywords: ['ETL'],
  competitivePosition: 'Competitivo para vagas júnior.',
  sections: [
    {
      key: 'headline',
      score: 70,
      analysis: 'Claro, mas genérico.',
      breakdown: [{ criterion: 'Clareza', points: 30, max: 40 }],
      tip: null,
      rewrite: 'Analista de Dados | SQL, Python e Power BI',
      actions: ['Inclua Power BI no título'],
    },
    {
      key: 'about',
      score: 60,
      analysis: 'Curto.',
      breakdown: [],
      tip: null,
      rewrite: 'Analista de dados que reduziu o tempo de relatórios em 90%.',
      actions: [],
    },
  ],
};

function worker(
  o: {
    analysis?: LinkedinAnalysis | null;
    doc?: DocumentRecord | null;
    consent?: boolean;
    fails?: boolean;
  } = {},
) {
  const saveReady = vi.fn(async () => {});
  const markFailed = vi.fn(async () => {});
  const refund = vi.fn(async () => {});
  const audit: AuditEntry[] = [];
  const ai = new FakeAiProvider().respond('analyze_linkedin', () => {
    if (o.fails) throw new AppError('DEPENDENCY_UNAVAILABLE', 'fora do ar');
    return OUTPUT;
  });
  const use = new AnalyzeLinkedin({
    analyses: {
      find: async () => (o.analysis === undefined ? analysis() : o.analysis),
      saveReady,
      markFailed,
    },
    documents: { find: async () => (o.doc === undefined ? document() : o.doc) },
    storage: { getBytes: async () => new Uint8Array([1]) },
    text: { extract: async () => PROFILE },
    consents: {
      status: async () => ({
        granted: { ai_processing: o.consent ?? true } as never,
        missingRequired: [],
      }),
    },
    users: { getById: async () => ({ name: 'Carla Exemplo' }) },
    ai,
    prompt: analyzeLinkedinV1,
    generations: { record: async () => {} },
    quota: { refund },
    audit: { record: async (e) => void audit.push(e) },
  });
  return { use, saveReady, markFailed, refund, audit };
}

const job = { userId: USER, analysisId: ID };

describe('AnalyzeLinkedin', () => {
  it('guarda o resultado com a nota calculada e sem o texto pronto com número inventado', async () => {
    const w = worker();
    await expect(w.use.run(job, { isLastAttempt: false })).resolves.toBe('ready');
    const result = (w.saveReady.mock.calls[0] as unknown[])[2] as {
      score: number;
      sections: { key: string; rewrite: string | null }[];
    };
    // (70 × 15 + 60 × 15) / 30 = 65
    expect(result.score).toBe(65);
    expect(result.sections.map((s) => [s.key, s.rewrite])).toEqual([
      ['headline', 'Analista de Dados | SQL, Python e Power BI'],
      ['about', null],
    ]);
    expect(w.refund).not.toHaveBeenCalled();
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

function service(
  o: {
    doc?: DocumentRecord | null;
    existing?: LinkedinAnalysis[];
    unlocked?: boolean;
    stored?: LinkedinAnalysis;
  } = {},
) {
  const enqueue = vi.fn(async () => {});
  const consume = vi.fn(async () => {});
  const insertProcessing = vi.fn(
    async (_u: string, a: { id: string; documentId: string; targetRole: string | null }) =>
      analysis({ ...a }),
  );
  const svc = new LinkedinAnalysisService({
    repo: {
      insertProcessing,
      find: async () => o.stored ?? null,
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
    features: { enabled: async () => o.unlocked ?? false },
    audit: { record: async () => {} },
  });
  return { svc, enqueue, consume, insertProcessing };
}

describe('LinkedinAnalysisService', () => {
  it('pede a análise com o cargo do objetivo ativo e gasta o limite uma vez', async () => {
    const s = service();
    await s.svc.request(USER, DOC);
    expect(s.consume).toHaveBeenCalledWith(USER, 'linkedin.analysis', expect.any(String));
    expect(s.insertProcessing).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ documentId: DOC, targetRole: 'Analista de Dados' }),
    );
    expect(s.enqueue).toHaveBeenCalledTimes(1);
  });

  it('recusa documento que não é o PDF do LinkedIn e repete a análise em andamento', async () => {
    await expect(
      service({ doc: document({ kind: 'resume' }) }).svc.request(USER, DOC),
    ).rejects.toThrow(/PDF do seu perfil/);
    const running = analysis();
    const s = service({ existing: [running] });
    await expect(s.svc.request(USER, DOC)).resolves.toBe(running);
    expect(s.consume).not.toHaveBeenCalled();
  });

  it('sem o plano, devolve a análise sem o texto pronto', async () => {
    const stored = analysis({
      status: 'ready',
      result: {
        score: 70,
        strengths: [],
        improvements: [],
        missingKeywords: [],
        competitivePosition: '',
        sections: [
          {
            key: 'headline',
            score: 70,
            analysis: '',
            breakdown: [],
            tip: null,
            rewrite: 'Texto',
            actions: [],
          },
        ],
      },
    });
    const locked = await service({ stored }).svc.get(USER, ID);
    expect(locked.rewritesLocked).toBe(true);
    expect(locked.result?.sections[0]?.rewrite).toBeNull();
    const unlocked = await service({ stored, unlocked: true }).svc.get(USER, ID);
    expect(unlocked.result?.sections[0]?.rewrite).toBe('Texto');
  });
});
