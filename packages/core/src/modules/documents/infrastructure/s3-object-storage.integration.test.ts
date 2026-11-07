import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestS3 } from '../../../testing/s3';

let s3: Awaited<ReturnType<typeof startTestS3>>;

beforeAll(async () => {
  s3 = await startTestS3();
}, 120_000);
afterAll(async () => s3?.stop());

describe('S3ObjectStorage', () => {
  it('envia por URL assinada, lê, confere e apaga', async () => {
    const body = new TextEncoder().encode('%PDF-1.7 teste');
    const url = await s3.storage.presignUpload('users/u1/documents/d1', {
      contentType: 'application/pdf',
      contentLength: body.byteLength,
      expiresInSeconds: 60,
    });
    const put = await fetch(url, {
      method: 'PUT',
      body,
      headers: { 'content-type': 'application/pdf' },
    });
    expect(put.status).toBe(200);
    expect(await s3.storage.head('users/u1/documents/d1')).toMatchObject({
      sizeBytes: body.byteLength,
    });
    expect(Buffer.from(await s3.storage.getBytes('users/u1/documents/d1')).toString()).toBe(
      '%PDF-1.7 teste',
    );
    await s3.storage.delete('users/u1/documents/d1');
    expect(await s3.storage.head('users/u1/documents/d1')).toBeNull();
  });

  it('libera o envio pelo navegador só a partir do site', async () => {
    await s3.storage.ensureBucket({ uploadOrigin: 'https://site.example' });
    const url = await s3.storage.presignUpload('users/u1/documents/cors', {
      contentType: 'application/pdf',
      contentLength: 4,
      expiresInSeconds: 60,
    });
    const preflight = (origin: string) =>
      fetch(url, {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'PUT',
          'access-control-request-headers': 'content-type',
        },
      });
    const allowed = await preflight('https://site.example');
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://site.example');
    const denied = await preflight('https://outro.example');
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('apaga tudo sob o prefixo de um usuário, sem tocar em outros', async () => {
    for (const key of ['users/a/documents/1', 'users/a/documents/2', 'users/b/documents/1']) {
      const url = await s3.storage.presignUpload(key, {
        contentType: 'application/pdf',
        contentLength: 4,
        expiresInSeconds: 60,
      });
      await fetch(url, {
        method: 'PUT',
        body: 'test',
        headers: { 'content-type': 'application/pdf' },
      });
    }
    expect(await s3.storage.deletePrefix('users/a/')).toBe(2);
    expect(await s3.storage.head('users/a/documents/1')).toBeNull();
    expect(await s3.storage.head('users/b/documents/1')).not.toBeNull();
  });
});
