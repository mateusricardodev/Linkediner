import { AppError } from '../../shared';
import {
  assertCanActivateGoal,
  validateCareerGoal,
  validateLinks,
  validateProfilePatch,
  type CareerGoal,
  type CareerGoalInput,
  type Profile,
  type ProfileLink,
} from '../domain/profile';
import type { ProfileRepository } from './ports/profile-repository';

export interface ProfileView extends Profile {
  links: ProfileLink[];
}

const notFound = () => new AppError('NOT_FOUND', 'Objetivo não encontrado.');

export class ProfileService {
  constructor(private readonly repo: ProfileRepository) {}

  async get(userId: string): Promise<ProfileView> {
    const profile = await this.repo.getOrCreateProfile(userId);
    return { ...profile, links: await this.repo.listLinks(userId) };
  }

  async update(userId: string, patch: Partial<Omit<Profile, 'id'>>): Promise<ProfileView> {
    await this.repo.getOrCreateProfile(userId);
    await this.repo.updateProfile(userId, validateProfilePatch(patch));
    return this.get(userId);
  }

  async replaceLinks(userId: string, links: ProfileLink[]): Promise<ProfileLink[]> {
    const normalized = validateLinks(links);
    const profile = await this.repo.getOrCreateProfile(userId);
    return this.repo.replaceLinks(userId, profile.id, normalized);
  }

  listGoals(userId: string): Promise<CareerGoal[]> {
    return this.repo.listGoals(userId);
  }

  async createGoal(userId: string, input: CareerGoalInput): Promise<CareerGoal> {
    const goal = validateCareerGoal(input);
    if (goal.isActive) assertCanActivateGoal(await this.repo.countActiveGoals(userId));
    return this.repo.insertGoal(userId, goal);
  }

  /** Atualização parcial: o que não vier no patch mantém o valor atual. */
  async updateGoal(
    userId: string,
    goalId: string,
    patch: Partial<CareerGoalInput>,
  ): Promise<CareerGoal> {
    const current = await this.repo.findGoal(userId, goalId);
    if (!current) throw notFound();
    const { id: _id, createdAt: _createdAt, ...base } = current;
    const goal = validateCareerGoal({ ...base, ...patch });
    if (goal.isActive && !current.isActive)
      assertCanActivateGoal(await this.repo.countActiveGoals(userId, goalId));
    const updated = await this.repo.updateGoal(userId, goalId, goal);
    if (!updated) throw notFound();
    return updated;
  }

  async deleteGoal(userId: string, goalId: string): Promise<void> {
    if (!(await this.repo.deleteGoal(userId, goalId))) throw notFound();
  }
}
