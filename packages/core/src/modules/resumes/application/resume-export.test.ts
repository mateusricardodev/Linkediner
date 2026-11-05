import { describe, expect, it, vi } from 'vitest';
import type { Resume, ResumeContent } from '../domain/resume';
import type { ResumeExportModel } from '../domain/export-model';
import { ResumeExportService } from './resume-export-service';

const content: ResumeContent = {
  summary: [],
  experiences: [],
  skills: ['TypeScript'],
  education: [],
  certifications: [],
  projects: [],
  languages: [],
};
const resume = (status: Resume['status']): Resume => ({
  id: 'r1',
  status,
  content,
  failureCode: null,
  approvedAt: status === 'approved' ? new Date(0) : null,
  createdAt: new Date(0),
});

function setup(found: Resume | null, watermark = true) {
  const render = vi.fn(async (_m: ResumeExportModel) => new Uint8Array([1, 2]));
  const record = vi.fn(async () => {});
  const service = new ResumeExportService({
    resumes: { find: async () => found },
    users: { getById: async () => ({ name: 'Ana', email: 'ana@example.com' }) },
    profiles: {
      getOrCreateProfile: async () => ({ headline: 'Engenheira' }),
      listLinks: async () => [{ kind: 'github', url: 'https://github.com/ana' }],
    },
    renderers: { pdf: { render }, docx: { render } },
    policy: { watermark: async () => watermark },
    audit: { record },
  });
  return { service, render, record };
}

describe('ResumeExportService', () => {
  it.each(['generating', 'draft', 'failed'] as const)('recusa currículo em %s', async (status) => {
    const { service, render } = setup(resume(status));
    await expect(service.export('u', 'r1', 'pdf')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(render).not.toHaveBeenCalled();
  });

  it('devolve 404 para currículo inexistente', async () => {
    await expect(setup(null).service.export('u', 'r1', 'pdf')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('exporta o aprovado com os dados do titular e registra na auditoria, sem conteúdo', async () => {
    const { service, render, record } = setup(resume('approved'));
    const file = await service.export('u', 'r1', 'docx');
    expect(file.fileName).toBe('curriculo.docx');
    expect(file.contentType).toContain('wordprocessingml');
    expect(render.mock.calls[0]?.[0]).toMatchObject({
      name: 'Ana',
      headline: 'Engenheira',
      contacts: ['ana@example.com', 'https://github.com/ana'],
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'resume.exported',
        metadata: { format: 'docx', watermark: true },
      }),
    );
  });

  it('a política decide a marca d’água', async () => {
    const paid = setup(resume('approved'), false);
    await paid.service.export('u', 'r1', 'pdf');
    expect(paid.render.mock.calls[0]?.[0].watermark).toBeNull();
    const free = setup(resume('approved'), true);
    await free.service.export('u', 'r1', 'pdf');
    expect(free.render.mock.calls[0]?.[0].watermark).toBeTruthy();
  });
});
