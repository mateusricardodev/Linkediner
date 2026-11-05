import type { AuditLog } from '../../audit';
import type { Profile, ProfileLink } from '../../profile';
import { AppError } from '../../shared';
import { toExportModel, type ExportFormat, type ResumeExportModel } from '../domain/export-model';
import type { ResumeRepository } from './ports/resume-repository';

export interface ResumeRenderer {
  render(model: ResumeExportModel): Promise<Uint8Array>;
}

/**
 * Decide se a exportação leva marca d'água. Hoje todo usuário está no plano gratuito.
 * Quando o billing chegar (M-14), a decisão passa a vir dos entitlements, sem mudar este fluxo.
 */
export interface ExportPolicy {
  watermark(userId: string): Promise<boolean>;
}

export const FREE_PLAN_EXPORT_POLICY: ExportPolicy = { watermark: async () => true };

export interface ResumeExportDeps {
  resumes: Pick<ResumeRepository, 'find'>;
  users: { getById(userId: string): Promise<{ name: string | null; email: string } | null> };
  profiles: {
    getOrCreateProfile(userId: string): Promise<Pick<Profile, 'headline'>>;
    listLinks(userId: string): Promise<ProfileLink[]>;
  };
  renderers: Record<ExportFormat, ResumeRenderer>;
  policy: ExportPolicy;
  audit: AuditLog;
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** Só currículo aprovado pelo usuário pode ser exportado. */
export class ResumeExportService {
  constructor(private readonly deps: ResumeExportDeps) {}

  async export(userId: string, resumeId: string, format: ExportFormat) {
    const resume = await this.deps.resumes.find(userId, resumeId);
    if (!resume) throw new AppError('NOT_FOUND', 'Currículo não encontrado.');
    if (resume.status !== 'approved' || !resume.content) {
      throw new AppError('CONFLICT', 'Aprove o currículo antes de exportar.');
    }

    const [user, profile, links, watermark] = await Promise.all([
      this.deps.users.getById(userId),
      this.deps.profiles.getOrCreateProfile(userId),
      this.deps.profiles.listLinks(userId),
      this.deps.policy.watermark(userId),
    ]);
    const model = toExportModel(
      resume.content,
      {
        name: user?.name ?? null,
        email: user?.email ?? null,
        headline: profile.headline,
        links: links.map((l) => l.url),
      },
      { watermark },
    );
    const bytes = await this.deps.renderers[format].render(model);

    await this.deps.audit.record({
      actorType: 'user',
      actorId: userId,
      action: 'resume.exported',
      entityType: 'resume',
      entityId: resumeId,
      metadata: { format, watermark },
    });
    return { bytes, contentType: CONTENT_TYPES[format], fileName: `curriculo.${format}` };
  }
}
