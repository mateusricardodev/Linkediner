import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractProfileV1, FakeAiProvider, type AiGenerationRecord } from '../../ai';
import type { AuditEntry } from '../../audit';
import type { DocumentRecord } from '../../documents';
import { AppError } from '../../shared';
import { EMPTY_EXTRACTION, type ExtractionOutput } from '../domain/grounding';
import { ExtractDocument } from './extract-document';
import { ExtractionRequests } from './extraction-requests';

const USER = '0193b2b0-0000-7000-8000-00000000000a';
const DOC_ID = '0193b2b0-0000-7000-8000-0000000000d1';
const CV = `Ana Lima
ana@exemplo.com
Engenheira Frontend na Nubank, jan 2021 - atual
Competências: TypeScript, React`;

const document = (o: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: DOC_ID,
  kind: 'resume',
  status: 'processing',
  objectKey: 'users/u/documents/d',
  discardedFacts: 0,
  droppedFields: 0,
  fileCheck: null,
  mimeType: 'application/pdf',
  sizeBytes: 100,
  sha256: 'x',
  failureCode: null,
  uploadedAt: new Date(),
  expiresAt: new Date(),
  createdAt: new Date(),
  ...o,
});

function setup(
  o: {
    doc?: DocumentRecord | null;
    consent?: boolean;
    text?: () => Promise<string>;
    output?: ExtractionOutput;
  } = {},
) {
  const setStatus = vi.fn(async () => {});
  const markProcessed = vi.fn(async () => {});
  const replaceExtracted = vi.fn(async (_u: string, _d: string, facts: unknown[]) => ({
    inserted: facts.length,
  }));
  const generations: AiGenerationRecord[] = [];
  const audit: AuditEntry[] = [];
  const ai = new FakeAiProvider().respond(
    'extract_profile',
    () =>
      o.output ?? {
        ...EMPTY_EXTRACTION,
        skills: [{ name: 'TypeScript', sourceSpan: 'Competências: TypeScript, React' }],
        certifications: [
          { name: 'Inventada', issuer: null, issuedAt: null, sourceSpan: 'não existe' },
        ],
      },
  );
  const refund = vi.fn(async () => {});
  const use = new ExtractDocument({
    documents: {
      find: async () => (o.doc === undefined ? document() : o.doc),
      setStatus,
      markProcessed,
    },
    storage: { getBytes: async () => new Uint8Array([1]) },
    text: { extract: o.text ?? (async () => CV) },
    consents: {
      status: async () => ({
        granted: { ai_processing: o.consent ?? true } as never,
        missingRequired: [],
      }),
    },
    users: { getById: async () => ({ name: 'Ana Lima' }) },
    ai,
    prompt: extractProfileV1,
    facts: { replaceExtracted },
    quota: { refund },
    generations: {
      record: async (e) => {
        generations.push(e);
      },
    },
    audit: {
      record: async (e) => {
        audit.push(e);
      },
    },
  });
  return { use, ai, setStatus, markProcessed, replaceExtracted, generations, audit, refund };
}

const job = { userId: USER, documentId: DOC_ID, usageId: 'u1' };
const run = (use: ExtractDocument, isLastAttempt = false) => use.run(job, { isLastAttempt });

describe('ExtractDocument', () => {
  it('só conta no limite a análise que deu certo', async () => {
    const ok = setup();
    await run(ok.use);
    expect(ok.refund).not.toHaveBeenCalled();

    const unreadable = setup({
      text: async () => {
        throw new Error('corrompido');
      },
    });
    await expect(run(unreadable.use)).resolves.toBe('failed');
    expect(unreadable.refund).toHaveBeenCalledWith(USER, 'profile.analysis', 'extract:u1');

    const revoked = setup({ consent: false });
    await run(revoked.use);
    expect(revoked.refund).toHaveBeenCalledOnce();

    const repeated = setup({ doc: document({ status: 'processed' }) });
    await run(repeated.use);
    expect(repeated.refund).not.toHaveBeenCalled();
  });

  it('envia à IA só o texto sem dados pessoais', async () => {
    const { use, ai } = setup();
    await run(use);
    const sent = String(ai.calls[0]?.promptInput.documentText);
    expect(sent).not.toContain('Ana Lima');
    expect(sent).not.toContain('ana@exemplo.com');
    expect(sent).toContain('Engenheira Frontend');
  });

  it('grava só fatos comprovados e registra modelo, prompt e validação', async () => {
    const { use, markProcessed, replaceExtracted, generations, audit } = setup();
    await expect(run(use)).resolves.toBe('processed');

    expect(replaceExtracted).toHaveBeenCalledOnce();
    const saved = replaceExtracted.mock.calls[0]?.[2] as { data: { name: string } }[];
    expect(saved.map((f) => f.data.name)).toEqual(['TypeScript']);
    // A certificação sem fonte foi descartada, e a contagem fica para avisar a pessoa.
    expect(markProcessed).toHaveBeenCalledWith(USER, DOC_ID, {
      discardedFacts: 1,
      droppedFields: 0,
    });

    expect(generations[0]).toMatchObject({
      task: 'extract_profile',
      usage: { provider: 'fake', promptId: 'extract_profile', promptVersion: 1 },
      validation: { accepted: 1, rejectedNoSource: 1, rejectedUnsupportedValue: 0 },
    });
    expect(generations[0]?.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(audit)).not.toContain('TypeScript');
  });

  it('não chama a IA se o consentimento foi revogado enquanto o job esperava', async () => {
    const { use, ai, setStatus, replaceExtracted } = setup({ consent: false });
    await expect(run(use)).resolves.toBe('skipped');
    expect(ai.calls).toHaveLength(0);
    expect(replaceExtracted).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith(USER, DOC_ID, 'uploaded');
  });

  it('ignora documento já apagado ou já processado', async () => {
    const gone = setup({ doc: null });
    await expect(run(gone.use)).resolves.toBe('skipped');
    const done = setup({ doc: document({ status: 'processed' }) });
    await expect(run(done.use)).resolves.toBe('skipped');
    expect(done.ai.calls).toHaveLength(0);
  });

  it.each([
    ['PDF escaneado', async () => '   ', 'no_text'],
    ['texto grande demais', async () => 'x'.repeat(100_001), 'too_long'],
    [
      'arquivo corrompido',
      async () => {
        throw new Error('bad xref');
      },
      'unreadable',
    ],
  ])('%s falha sem nova tentativa e sem chamar a IA', async (_nome, text, code) => {
    const { use, ai, setStatus } = setup({ text });
    await expect(run(use)).resolves.toBe('failed');
    expect(ai.calls).toHaveLength(0);
    expect(setStatus).toHaveBeenCalledWith(USER, DOC_ID, 'failed', code);
  });

  describe('falha transitória da IA', () => {
    let scenario: ReturnType<typeof setup>;
    beforeEach(() => {
      scenario = setup();
      scenario.ai.generateStructured = async () => {
        throw new AppError('DEPENDENCY_UNAVAILABLE', 'fora do ar');
      };
    });

    it('sobe o erro para a fila tentar de novo, sem marcar falha', async () => {
      await expect(run(scenario.use)).rejects.toThrow('fora do ar');
      expect(scenario.setStatus).not.toHaveBeenCalled();
    });

    it('na última tentativa marca o documento como falho', async () => {
      await expect(run(scenario.use, true)).rejects.toThrow('fora do ar');
      expect(scenario.setStatus).toHaveBeenCalledWith(USER, DOC_ID, 'failed', 'processing_error');
    });
  });
});

describe('ExtractionRequests', () => {
  function requests(
    o: {
      doc?: DocumentRecord | null;
      consent?: boolean;
      queueFails?: boolean;
      quotaExceeded?: boolean;
    } = {},
  ) {
    const setStatus = vi.fn(async () => {});
    const enqueue = vi.fn(async () => {
      if (o.queueFails) throw new Error('fila fora');
    });
    const quota = {
      consume: vi.fn(async () => {
        if (o.quotaExceeded) throw new AppError('QUOTA_EXCEEDED', 'limite');
      }),
      refund: vi.fn(async () => {}),
    };
    const service = new ExtractionRequests(
      {
        find: async () => (o.doc === undefined ? document({ status: 'uploaded' }) : o.doc),
        setStatus,
      },
      {
        status: async () => ({
          granted: { ai_processing: o.consent ?? true } as never,
          missingRequired: [],
        }),
      },
      { enqueue },
      quota,
    );
    return { service, setStatus, enqueue, quota };
  }

  it('enfileira só IDs e marca o documento como em processamento', async () => {
    const { service, setStatus, enqueue } = requests();
    const result = await service.request(USER, DOC_ID);
    expect(result.status).toBe('processing');
    expect(enqueue).toHaveBeenCalledWith({
      userId: USER,
      documentId: DOC_ID,
      usageId: expect.any(String),
    });
    expect(setStatus).toHaveBeenCalledWith(USER, DOC_ID, 'processing');
  });

  it('exige o consentimento de processamento por IA', async () => {
    const { service, enqueue } = requests({ consent: false });
    await expect(service.request(USER, DOC_ID)).rejects.toMatchObject({
      code: 'CONSENT_REQUIRED',
      details: { missing: ['ai_processing'] },
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('não reprocessa documento em andamento ou concluído e recusa upload incompleto', async () => {
    for (const status of ['processing', 'processed'] as const) {
      const { service, enqueue } = requests({ doc: document({ status }) });
      await service.request(USER, DOC_ID);
      expect(enqueue).not.toHaveBeenCalled();
    }
    const pending = requests({ doc: document({ status: 'pending_upload' }) });
    await expect(pending.service.request(USER, DOC_ID)).rejects.toMatchObject({ code: 'CONFLICT' });
    const gone = requests({ doc: null });
    await expect(gone.service.request(USER, DOC_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('permite tentar de novo depois de uma falha', async () => {
    const { service, enqueue } = requests({
      doc: document({ status: 'failed', failureCode: 'x' }),
    });
    const result = await service.request(USER, DOC_ID);
    expect(enqueue).toHaveBeenCalledOnce();
    expect(result.failureCode).toBeNull();
  });

  it('sem limite no plano, o documento não entra em análise, e o upload continua válido', async () => {
    const doc = document({ status: 'uploaded' });
    const { service, setStatus, enqueue } = requests({ doc, quotaExceeded: true });
    await expect(service.request(USER, DOC_ID)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    await expect(service.requestIfAllowed(USER, doc)).resolves.toBe(doc);
    expect(setStatus).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('se a fila falhar, volta o documento para enviado e devolve o limite', async () => {
    const { service, setStatus, quota } = requests({ queueFails: true });
    await expect(service.request(USER, DOC_ID)).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    });
    expect(setStatus).toHaveBeenLastCalledWith(USER, DOC_ID, 'uploaded');
    expect(quota.refund).toHaveBeenCalledOnce();
  });

  it('depois do upload, sem consentimento ou com a fila fora, mantém o documento como está', async () => {
    const doc = document({ status: 'uploaded' });
    const noConsent = requests({ doc, consent: false });
    await expect(noConsent.service.requestIfAllowed(USER, doc)).resolves.toBe(doc);
    const queueDown = requests({ doc, queueFails: true });
    await expect(queueDown.service.requestIfAllowed(USER, doc)).resolves.toBe(doc);
  });
});
