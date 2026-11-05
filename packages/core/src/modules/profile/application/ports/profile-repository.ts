import type { CareerGoal, CareerGoalInput, Profile, ProfileLink } from '../../domain/profile';

/** Toda operação recebe o userId do dono: a implementação aplica o contexto de usuário (RLS). */
export interface ProfileRepository {
  getOrCreateProfile(userId: string): Promise<Profile>;
  updateProfile(userId: string, patch: Partial<Omit<Profile, 'id'>>): Promise<Profile>;
  listLinks(userId: string): Promise<ProfileLink[]>;
  replaceLinks(userId: string, profileId: string, links: ProfileLink[]): Promise<ProfileLink[]>;
  listGoals(userId: string): Promise<CareerGoal[]>;
  findGoal(userId: string, goalId: string): Promise<CareerGoal | null>;
  countActiveGoals(userId: string, excludeGoalId?: string): Promise<number>;
  insertGoal(userId: string, goal: CareerGoalInput): Promise<CareerGoal>;
  updateGoal(userId: string, goalId: string, goal: CareerGoalInput): Promise<CareerGoal | null>;
  deleteGoal(userId: string, goalId: string): Promise<boolean>;
}
