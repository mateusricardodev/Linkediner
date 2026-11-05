import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleDocumentRetentionRepository, ExpireDocuments } from '@linkediner/core/documents';
import { startTestApp } from './testing/app';

let t: Awaited<ReturnType<typeof startTestApp>>;
let alice = '';
let bob = '';

const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
const HTML = new TextEncoder().encode('<html><body>não sou pdf</body></html>');

beforeAll(async () => {
  t = await startTestApp();
  alice = await t.signUp('alice@example.com');
  bob = await t.signUp('bob@example.com');
}, 180_000);

afterAll(async () => t?.stop());

/** Faz o fluxo do navegador: pede a URL, envia o arquivo direto ao storage e confirma. */
async function upload(
  cookie: string,
  kind: string,
  mimeType: string,
  bytes: Uint8Array,
  declaredSize = bytes.byteLength,
) {
  const req = await t.call(cookie, 'POST', '/v1/documents', {
    kind,
    mimeType,
    sizeBytes: declaredSize,
  });
  if (req.statusCode !== 201) return { request: req };
  const { document, upload: target } = req.json();
  const put = await fetch(target.url, { method: 'PUT', body: bytes, headers: target.headers });
  const complete = await t.call(cookie, 'POST', `/v1/documents/${document.id}/complete`);
  return { request: req, put, complete, id: document.id as string };
}

describe('upload de documentos', () => {
  let docId = '';

  it('envia um currículo em PDF e confirma', async () => {
    const r = await upload(alice, 'resume', 'application/pdf', PDF);
    expect(r.request.statusCode).toBe(201);
    expect(r.put?.status).toBe(200);
    expect(r.complete?.statusCode).toBe(200);
    expect(r.complete?.json()).toMatchObject({
      kind: 'resume',
      status: 'uploaded',
      sizeBytes: PDF.byteLength,
    });
    docId = r.id!;
  });

  it('nunca expõe o caminho interno do arquivo', async () => {
    const res = await t.call(alice, 'GET', `/v1/documents/${docId}`);
    expect(res.json()).not.toHaveProperty('objectKey');
    expect(res.body).not.toContain('users/');
  });

  it('documento expira em 30 dias', async () => {
    const doc = (await t.call(alice, 'GET', `/v1/documents/${docId}`)).json();
    const days =
      (new Date(doc.expiresAt).getTime() - new Date(doc.createdAt).getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });

  it('gera link temporário de download que devolve o arquivo', async () => {
    const res = await t.call(alice, 'GET', `/v1/documents/${docId}/download`);
    expect(res.statusCode).toBe(200);
    const file = await fetch(res.json().url);
    expect(Buffer.from(await file.arrayBuffer()).equals(Buffer.from(PDF))).toBe(true);
  });

  it('PDF do LinkedIn só aceita PDF', async () => {
    const r = await upload(
      alice,
      'linkedin_pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      PDF,
    );
    expect(r.request.statusCode).toBe(400);
  });

  it('rejeita arquivo acima de 10 MB antes do upload', async () => {
    const res = await t.call(alice, 'POST', '/v1/documents', {
      kind: 'resume',
      mimeType: 'application/pdf',
      sizeBytes: 11 * 1024 * 1024,
    });
    expect(res.statusCode).toBe(400);
  });

  it('arquivo que não é PDF de verdade é recusado e apagado', async () => {
    const r = await upload(alice, 'resume', 'application/pdf', HTML);
    expect(r.complete?.statusCode).toBe(400);
    expect(r.complete?.json().title).toMatch(/não é um PDF/);
    expect((await t.call(alice, 'GET', `/v1/documents/${r.id}`)).statusCode).toBe(404);
    const keys = await t.db.pool.query('SELECT count(*)::int AS n FROM documents WHERE id = $1', [
      r.id,
    ]);
    expect(keys.rows[0].n).toBe(0);
  });

  it('confirmar antes de enviar o arquivo devolve 409', async () => {
    const req = await t.call(alice, 'POST', '/v1/documents', {
      kind: 'resume',
      mimeType: 'application/pdf',
      sizeBytes: 100,
    });
    const res = await t.call(alice, 'POST', `/v1/documents/${req.json().document.id}/complete`);
    expect(res.statusCode).toBe(409);
  });

  it('outro usuário não lê, confirma, baixa nem apaga o documento (404)', async () => {
    for (const [method, url] of [
      ['GET', `/v1/documents/${docId}`],
      ['POST', `/v1/documents/${docId}/complete`],
      ['GET', `/v1/documents/${docId}/download`],
      ['DELETE', `/v1/documents/${docId}`],
    ] as const) {
      expect((await t.call(bob, method, url)).statusCode).toBe(404);
    }
    expect((await t.call(bob, 'GET', '/v1/documents')).json()).toEqual([]);
  });

  it('apaga o documento e o arquivo imediatamente', async () => {
    const before = await t.db.pool.query('SELECT object_key FROM documents WHERE id = $1', [docId]);
    const key = before.rows[0].object_key as string;
    expect((await t.call(alice, 'DELETE', `/v1/documents/${docId}`)).statusCode).toBe(204);
    expect(await t.storage.head(key)).toBeNull();
    expect((await t.call(alice, 'GET', `/v1/documents/${docId}`)).statusCode).toBe(404);
  });
});

describe('retenção de 30 dias', () => {
  it('apaga arquivo e registro de documentos vencidos e uploads abandonados', async () => {
    const vencido = await upload(alice, 'resume', 'application/pdf', PDF);
    const valido = await upload(alice, 'resume', 'application/pdf', PDF);
    const abandonado = await t.call(alice, 'POST', '/v1/documents', {
      kind: 'resume',
      mimeType: 'application/pdf',
      sizeBytes: 10,
    });
    const abandonadoId = abandonado.json().document.id;

    await t.db.pool.query(
      "UPDATE documents SET expires_at = now() - interval '1 minute' WHERE id = $1",
      [vencido.id],
    );
    await t.db.pool.query(
      "UPDATE documents SET created_at = now() - interval '25 hours' WHERE id = $1",
      [abandonadoId],
    );
    const { rows } = await t.db.pool.query('SELECT object_key FROM documents WHERE id = $1', [
      vencido.id,
    ]);

    const result = await new ExpireDocuments(
      new DrizzleDocumentRetentionRepository(t.db.db),
      t.storage,
      t.audit,
    ).run();
    expect(result.deleted).toBe(2);

    expect(await t.storage.head(rows[0].object_key)).toBeNull();
    const remaining = (await t.call(alice, 'GET', '/v1/documents'))
      .json()
      .map((d: { id: string }) => d.id);
    expect(remaining).toContain(valido.id);
    expect(remaining).not.toContain(vencido.id);
    expect(remaining).not.toContain(abandonadoId);

    const audit = await t.db.pool.query(
      "SELECT count(*)::int AS n FROM audit_logs WHERE action = 'document.expired'",
    );
    expect(audit.rows[0].n).toBe(2);
  });
});
