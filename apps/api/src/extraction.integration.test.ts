import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DrizzleAiGenerationLog, extractProfileV1, FakeAiProvider } from '@linkediner/core/ai';
import {
  DrizzleDocumentRepository,
  DrizzleDocumentRetentionRepository,
  ExpireDocuments,
} from '@linkediner/core/documents';
import {
  EMPTY_EXTRACTION,
  ExtractDocument,
  FileTextExtractor,
  type ExtractionOutput,
} from '@linkediner/core/extraction/worker';
import { DrizzleUserReader } from '@linkediner/core/identity';
import { DrizzleFactRepository } from '@linkediner/core/profile';
import { buildTestPdf } from '@linkediner/core/testing';
import { startTestApp } from './testing/app';

// Currículo fictício. Nenhuma chamada real de IA acontece aqui.
const LINE = 'Engenheira Frontend na Nubank desde 2021. Competencias: TypeScript e React.';
const PDF = buildTestPdf(LINE);

const GROUNDED: ExtractionOutput = {
  ...EMPTY_EXTRACTION,
  experiences: [
    {
      company: 'Nubank',
      title: 'Engenheira Frontend',
      startDate: '2021',
      endDate: null,
      location: null,
      description: null,
      sourceSpan: 'Engenheira Frontend na Nubank desde 2021',
    },
  ],
  skills: [
    { name: 'TypeScript', sourceSpan: 'Competencias: TypeScript' },
    { name: 'React', sourceSpan: 'TypeScript e React' },
  ],
  // Invenções: não podem chegar ao perfil.
  certifications: [
    {
      name: 'AWS Solutions Architect',
      issuer: null,
      issuedAt: null,
      sourceSpan: 'Certificado AWS',
    },
  ],
  achievements: [
    { description: 'Reduzi custos em 90%', sourceSpan: 'Engenheira Frontend na Nubank' },
  ],
};

let t: Awaited<ReturnType<typeof startTestApp>>;
let ai: FakeAiProvider;
let extract: ExtractDocument;
let output: ExtractionOutput;

beforeAll(async () => {
  t = await startTestApp();
  const db = t.db.db;
  ai = new FakeAiProvider().respond('extract_profile', () => output);
  extract = new ExtractDocument({
    documents: new DrizzleDocumentRepository(db),
    storage: t.storage,
    text: new FileTextExtractor(),
    consents: t.consents,
    users: new DrizzleUserReader(db),
    ai,
    prompt: extractProfileV1,
    facts: new DrizzleFactRepository(db, t.cipher),
    generations: new DrizzleAiGenerationLog(db, t.cipher),
    audit: t.audit,
  });
}, 180_000);

afterAll(async () => t?.stop());

beforeEach(() => {
  output = GROUNDED;
  t.queue.jobs.length = 0;
});

const grantAi = (cookie: string, granted = true) =>
  t.call(cookie, 'PUT', '/v1/me/consents/ai_processing', { granted });

async function upload(cookie: string, bytes = PDF) {
  const req = await t.call(cookie, 'POST', '/v1/documents', {
    kind: 'resume',
    mimeType: 'application/pdf',
    sizeBytes: bytes.byteLength,
  });
  const { document, upload: target } = req.json();
  await fetch(target.url, { method: 'PUT', body: bytes, headers: target.headers });
  return {
    id: document.id as string,
    complete: await t.call(cookie, 'POST', `/v1/documents/${document.id}/complete`),
  };
}

/** Processa os jobs da fila como o worker faria. */
async function runQueuedJobs() {
  for (const job of t.queue.jobs.splice(0)) await extract.run(job, { isLastAttempt: true });
}

const factsOf = async (cookie: string) => (await t.call(cookie, 'GET', '/v1/profile/facts')).json();

describe('extração de currículo', () => {
  it('sem consentimento de IA, o upload funciona mas nada vai para a fila', async () => {
    const cookie = await t.signUp('sem-consentimento@example.com');
    const { id, complete } = await upload(cookie);
    expect(complete.json().status).toBe('uploaded');
    expect(t.queue.jobs).toEqual([]);

    const extractRes = await t.call(cookie, 'POST', `/v1/documents/${id}/extract`);
    expect(extractRes.statusCode).toBe(403);
    expect(extractRes.json()).toMatchObject({
      code: 'CONSENT_REQUIRED',
      details: { missing: ['ai_processing'] },
    });
  });

  it('com consentimento, extrai só os fatos comprovados pelo documento', async () => {
    const cookie = await t.signUp('ana@example.com');
    await grantAi(cookie);
    const { id, complete } = await upload(cookie);
    expect(complete.json().status).toBe('processing');
    expect(t.queue.jobs).toHaveLength(1);
    expect(Object.keys(t.queue.jobs[0]!).sort()).toEqual(['documentId', 'userId']);

    await runQueuedJobs();

    expect((await t.call(cookie, 'GET', `/v1/documents/${id}`)).json().status).toBe('processed');
    const facts = await factsOf(cookie);
    expect(facts.map((f: { type: string }) => f.type).sort()).toEqual([
      'experience',
      'skill',
      'skill',
    ]);
    expect(JSON.stringify(facts)).not.toContain('AWS');
    expect(JSON.stringify(facts)).not.toContain('90%');
    expect(facts[0]).toMatchObject({ verification: 'extracted', sourceDocumentId: id });

    const { rows } = await t.db.pool.query(
      'SELECT task, provider, prompt_id, prompt_version, validation FROM ai_generations',
    );
    expect(rows.at(-1)).toMatchObject({
      task: 'extract_profile',
      provider: 'fake',
      prompt_id: 'extract_profile',
      prompt_version: 1,
      validation: { accepted: 3, rejectedNoSource: 1, rejectedUnsupportedValue: 1 },
    });
  });

  it('os fatos extraídos sobem o score, sem repetir o histórico', async () => {
    const cookie = await t.signUp('score-extracao@example.com');
    await grantAi(cookie);
    await upload(cookie);
    await runQueuedJobs();
    const first = (await t.call(cookie, 'GET', '/v1/profile/score')).json();
    const criterion = (name: string) =>
      first.factors.find((f: { criterion: string }) => f.criterion === name);
    expect(first.score).toBeGreaterThan(0);
    expect(criterion('experience').factIds).toHaveLength(1);
    expect(criterion('skills').factIds).toHaveLength(2);
    const again = (await t.call(cookie, 'GET', '/v1/profile/score')).json();
    expect(again.history).toHaveLength(1);
  });

  it('o texto enviado à IA veio do PDF real e sem o nome do titular', async () => {
    const cookie = await t.signUp('titular@example.com');
    await grantAi(cookie);
    // O cadastro de teste usa o nome "Pessoa Teste".
    await upload(cookie, buildTestPdf(`Pessoa Teste. ${LINE}`));
    ai.calls.length = 0;
    await runQueuedJobs();
    const sent = String(ai.calls[0]?.promptInput.documentText);
    expect(sent).toContain('Engenheira Frontend');
    expect(sent).not.toContain('Pessoa Teste');
  });

  it('PDF sem texto suficiente falha com código estável, sem chamar a IA', async () => {
    const cookie = await t.signUp('escaneado@example.com');
    await grantAi(cookie);
    const { id } = await upload(cookie, buildTestPdf('curto'));
    ai.calls.length = 0;
    await runQueuedJobs();
    expect(ai.calls).toHaveLength(0);
    expect((await t.call(cookie, 'GET', `/v1/documents/${id}`)).json()).toMatchObject({
      status: 'failed',
      failureCode: 'no_text',
    });
  });

  it('o mesmo fato em dois documentos não duplica', async () => {
    const cookie = await t.signUp('dois-docs@example.com');
    await grantAi(cookie);
    await upload(cookie);
    await upload(cookie);
    await runQueuedJobs();
    expect(await factsOf(cookie)).toHaveLength(3);
  });

  it('reprocessar o mesmo documento é seguro', async () => {
    const cookie = await t.signUp('reprocessa@example.com');
    await grantAi(cookie);
    const { id } = await upload(cookie);
    const [job] = t.queue.jobs;
    await runQueuedJobs();
    await t.db.pool.query("UPDATE documents SET status = 'processing' WHERE id = $1", [id]);
    await extract.run(job!, { isLastAttempt: true });
    expect(await factsOf(cookie)).toHaveLength(3);
  });

  it('revogar o consentimento antes do job rodar impede a chamada à IA', async () => {
    const cookie = await t.signUp('revoga@example.com');
    await grantAi(cookie);
    const { id } = await upload(cookie);
    await grantAi(cookie, false);
    ai.calls.length = 0;
    await runQueuedJobs();
    expect(ai.calls).toHaveLength(0);
    expect((await t.call(cookie, 'GET', `/v1/documents/${id}`)).json().status).toBe('uploaded');
  });
});

describe('fatos do perfil', () => {
  let cookie = '';
  let facts: { id: string; type: string; data: Record<string, string | null> }[] = [];
  const fact = (type: string) => facts.find((f) => f.type === type)!;

  beforeAll(async () => {
    cookie = await t.signUp('fatos@example.com');
    await grantAi(cookie);
    await upload(cookie);
    output = GROUNDED;
    await runQueuedJobs();
    facts = await factsOf(cookie);
  });

  it('outro usuário não vê nem altera os fatos (404)', async () => {
    const other = await t.signUp('outro@example.com');
    expect(await factsOf(other)).toEqual([]);
    const res = await t.call(other, 'PATCH', `/v1/profile/facts/${facts[0]!.id}`, {
      verification: 'rejected',
    });
    expect(res.statusCode).toBe(404);
  });

  it('confirma e corrige um fato', async () => {
    const experience = fact('experience');
    const res = await t.call(cookie, 'PATCH', `/v1/profile/facts/${experience.id}`, {
      verification: 'user_confirmed',
      data: { ...experience.data, location: 'Remoto' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      verification: 'user_confirmed',
      data: { company: 'Nubank', location: 'Remoto' },
    });
  });

  it('recusa dados com formato errado para o tipo do fato', async () => {
    const res = await t.call(cookie, 'PATCH', `/v1/profile/facts/${fact('experience').id}`, {
      verification: 'user_confirmed',
      data: { name: 'sem empresa nem cargo' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('fato recusado não volta quando o documento é reprocessado', async () => {
    const skill = facts.find((f) => f.data.name === 'React')!;
    await t.call(cookie, 'PATCH', `/v1/profile/facts/${skill.id}`, { verification: 'rejected' });
    await upload(cookie);
    await runQueuedJobs();
    const after: typeof facts = await factsOf(cookie);
    const react = after.filter((f) => f.data.name === 'React');
    expect(react).toHaveLength(1);
    expect(react[0]).toMatchObject({ verification: 'rejected' });
  });
});

describe('exclusão e retenção', () => {
  it('apagar o documento remove os fatos não confirmados e mantém os confirmados', async () => {
    const cookie = await t.signUp('apaga@example.com');
    await grantAi(cookie);
    const { id } = await upload(cookie);
    await runQueuedJobs();
    const facts = await factsOf(cookie);
    const kept = facts.find((f: { type: string }) => f.type === 'experience');
    await t.call(cookie, 'PATCH', `/v1/profile/facts/${kept.id}`, {
      verification: 'user_confirmed',
    });

    expect((await t.call(cookie, 'DELETE', `/v1/documents/${id}`)).statusCode).toBe(204);

    const after = await factsOf(cookie);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: kept.id, sourceDocumentId: null });
  });

  it('na expiração de 30 dias, o fato fica mas o trecho do documento é apagado', async () => {
    const cookie = await t.signUp('expira@example.com');
    await grantAi(cookie);
    const { id } = await upload(cookie);
    await runQueuedJobs();
    await t.db.pool.query(
      "UPDATE documents SET expires_at = now() - interval '1 minute' WHERE id = $1",
      [id],
    );

    await new ExpireDocuments(
      new DrizzleDocumentRetentionRepository(t.db.db),
      t.storage,
      t.audit,
    ).run();

    const after = await factsOf(cookie);
    expect(after).toHaveLength(3);
    for (const f of after) expect(f).toMatchObject({ sourceDocumentId: null, sourceSpan: null });
  });

  it('o registro de IA antigo é apagado, e o recente fica', async () => {
    const log = new DrizzleAiGenerationLog(t.db.db, t.cipher);
    const count = async () =>
      (await t.db.pool.query('SELECT count(*)::int AS n FROM ai_generations')).rows[0].n as number;
    const before = await count();
    expect(before).toBeGreaterThan(0);
    // Datas bem distantes: o resultado não pode depender de quanto tempo os testes levaram.
    const day = 24 * 60 * 60 * 1000;
    await expect(log.deleteOlderThan(new Date(Date.now() - day))).resolves.toBe(0);
    await expect(log.deleteOlderThan(new Date(Date.now() + day))).resolves.toBe(before);
    expect(await count()).toBe(0);
  });
});
