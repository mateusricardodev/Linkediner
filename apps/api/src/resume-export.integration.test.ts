import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleResumeRepository, type ResumeContent } from '@linkediner/core/resumes';
import { startTestApp } from './testing/app';

// Dados fictícios. A geração é simulada direto no banco: a IA não participa deste fluxo.
let t: Awaited<ReturnType<typeof startTestApp>>;
let resumes: DrizzleResumeRepository;

const content = (): ResumeContent => ({
  summary: [],
  experiences: [
    {
      factId: 'e1',
      company: 'Nubank',
      title: 'Engenheira',
      startDate: '2021',
      endDate: null,
      location: null,
      bullets: [
        {
          id: '0193b2b0-0000-7000-8000-0000000000b1',
          text: 'Reduzi o build em 40%',
          factIds: ['e1'],
          status: 'grounded',
          reason: null,
        },
        {
          id: '0193b2b0-0000-7000-8000-0000000000b2',
          text: 'Reduzi custos em 90%',
          factIds: ['e1'],
          status: 'suggested',
          reason: 'unsupported_value',
        },
      ],
    },
  ],
  skills: ['TypeScript'],
  education: [],
  certifications: [],
  projects: [],
  languages: [],
});
const SUGGESTION = '0193b2b0-0000-7000-8000-0000000000b2';

beforeAll(async () => {
  t = await startTestApp();
  resumes = new DrizzleResumeRepository(t.db.db, t.cipher);
}, 180_000);

afterAll(async () => t?.stop());

async function draftFor(email: string) {
  const cookie = await t.signUp(email);
  const userId = (await t.call(cookie, 'GET', '/v1/me')).json().user.id as string;
  const id = crypto.randomUUID();
  await resumes.insertGenerating(userId, id);
  await resumes.saveDraft(userId, id, content());
  return { cookie, id };
}

const approve = (cookie: string, id: string) => t.call(cookie, 'POST', `/v1/resumes/${id}/approve`);
const exportAs = (cookie: string, id: string, format: string) =>
  t.call(cookie, 'GET', `/v1/resumes/${id}/export?format=${format}`);

describe('aprovação', () => {
  it('não aprova com sugestões pendentes e diz quantas faltam', async () => {
    const { cookie, id } = await draftFor('pendente@example.com');
    const res = await approve(cookie, id);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ details: { pendingSuggestions: 1 } });
  });

  it('aprova depois que o usuário decide sobre todas as sugestões', async () => {
    const { cookie, id } = await draftFor('aprova@example.com');
    await t.call(cookie, 'PATCH', `/v1/resumes/${id}/items/${SUGGESTION}`, { action: 'remove' });
    const res = await approve(cookie, id);
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('approved');
    expect(res.json().approvedAt).toBeTruthy();
  });

  it('editar depois de aprovar exige nova aprovação', async () => {
    const { cookie, id } = await draftFor('reaprova@example.com');
    const item = `/v1/resumes/${id}/items/${SUGGESTION}`;
    await t.call(cookie, 'PATCH', item, { action: 'remove' });
    await approve(cookie, id);

    const edited = await t.call(cookie, 'PATCH', item, { action: 'confirm', text: 'Reduzi 10%' });
    expect(edited.json()).toMatchObject({ status: 'draft', approvedAt: null });
    expect((await exportAs(cookie, id, 'pdf')).statusCode).toBe(409);
  });

  it('outro usuário não aprova nem exporta (404)', async () => {
    const { cookie, id } = await draftFor('dono-export@example.com');
    await t.call(cookie, 'PATCH', `/v1/resumes/${id}/items/${SUGGESTION}`, { action: 'remove' });
    await approve(cookie, id);
    const other = await t.signUp('outro-export@example.com');
    expect((await approve(other, id)).statusCode).toBe(404);
    expect((await exportAs(other, id, 'pdf')).statusCode).toBe(404);
  });
});

describe('exportação', () => {
  it('recusa currículo não aprovado', async () => {
    const { cookie, id } = await draftFor('nao-aprovado@example.com');
    expect((await exportAs(cookie, id, 'pdf')).statusCode).toBe(409);
  });

  it('recusa formato desconhecido', async () => {
    const { cookie, id } = await draftFor('formato@example.com');
    expect((await exportAs(cookie, id, 'exe')).statusCode).toBe(400);
  });

  it.each([
    ['pdf', 'application/pdf', '%PDF-'],
    ['docx', 'wordprocessingml', 'PK'],
  ])('entrega o arquivo em %s', async (format, contentType, signature) => {
    const { cookie, id } = await draftFor(`arquivo-${format}@example.com`);
    await t.call(cookie, 'PATCH', `/v1/resumes/${id}/items/${SUGGESTION}`, { action: 'remove' });
    await approve(cookie, id);

    const res = await exportAs(cookie, id, format);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain(contentType);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="curriculo.${format}"`);
    expect(res.rawPayload.subarray(0, signature.length).toString()).toBe(signature);
  });

  it('registra aprovação e exportação na auditoria', async () => {
    const { rows } = await t.db.pool.query(
      "SELECT DISTINCT action FROM audit_logs WHERE action IN ('resume.approved', 'resume.exported')",
    );
    expect(rows.map((r) => r.action).sort()).toEqual(['resume.approved', 'resume.exported']);
  });
});
