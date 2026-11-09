import type { Job } from '../../jobs';
import type { Profile, ProfileLink } from '../../profile';
import { AppError } from '../../shared';
import { analyzeAts, type AtsReport } from '../domain/ats';
import type { ResumeRepository } from './ports/resume-repository';

/** As vagas mais recentes bastam: o objetivo de quem busca muda com o tempo. */
const RECENT_JOBS = 20;

export interface ResumeAtsDeps {
  resumes: Pick<ResumeRepository, 'find'>;
  profiles: {
    getOrCreateProfile(userId: string): Promise<Pick<Profile, 'headline'>>;
    listLinks(userId: string): Promise<ProfileLink[]>;
  };
  jobs: { list(userId: string): Promise<Job[]> };
}

/** Confere o currículo pelo padrão ATS na leitura, sem gravar nada e sem chamar a IA (ADR 0025). */
export class ResumeAtsService {
  constructor(private readonly deps: ResumeAtsDeps) {}

  async analyze(userId: string, resumeId: string): Promise<AtsReport> {
    const resume = await this.deps.resumes.find(userId, resumeId);
    if (!resume) throw new AppError('NOT_FOUND', 'Currículo não encontrado.');
    if (!resume.content) {
      throw new AppError('CONFLICT', 'O currículo ainda não está pronto para a conferência.');
    }
    const [profile, links, jobs] = await Promise.all([
      this.deps.profiles.getOrCreateProfile(userId),
      this.deps.profiles.listLinks(userId),
      this.deps.jobs.list(userId),
    ]);
    const ready = jobs.filter((job) => job.status === 'ready');
    // Currículo para uma vaga: os termos que faltam são os dessa vaga, e não os de todas as salvas.
    const target = resume.jobId ? ready.filter((job) => job.id === resume.jobId) : [];
    const recent =
      target.length > 0
        ? target
        : ready.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, RECENT_JOBS);
    return analyzeAts({
      content: resume.content,
      headline: profile.headline,
      linkKinds: links.map((l) => l.kind),
      jobRequirements: recent.map((job) => [...job.mustHave, ...job.niceToHave]),
      targeted: target.length > 0,
    });
  }
}
