import { z } from 'zod';

export const LinkKind = z
  .enum(['linkedin', 'github', 'portfolio', 'other'])
  .meta({ id: 'LinkKind' });
export const Seniority = z
  .enum(['intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'lead', 'manager'])
  .meta({ id: 'Seniority' });
export const Currency = z.enum(['BRL', 'USD', 'EUR']).meta({ id: 'Currency' });
export const SalaryPeriod = z.enum(['month', 'year']).meta({ id: 'SalaryPeriod' });

export const ProfileLinkDto = z
  .object({ kind: LinkKind, url: z.string().max(300) })
  .meta({ id: 'ProfileLink' });

export const LinkedinChecklistItem = z
  .enum(['open_to_work', 'custom_url', 'headline', 'about', 'skills', 'job_preferences', 'photo'])
  .meta({ id: 'LinkedinChecklistItem' });

export const ProfileDto = z
  .object({
    id: z.uuid(),
    headline: z.string().nullable(),
    summary: z.string().nullable(),
    yearsExperience: z.number().int().nullable(),
    /** Ajustes do LinkedIn que a pessoa marcou como feitos. */
    linkedinChecklist: z.array(LinkedinChecklistItem),
    links: z.array(ProfileLinkDto),
  })
  .meta({ id: 'Profile' });

export const UpdateProfileBody = z
  .object({
    headline: z.string().max(500).nullable().optional(),
    summary: z.string().max(5000).nullable().optional(),
    yearsExperience: z.number().int().nullable().optional(),
    linkedinChecklist: z.array(LinkedinChecklistItem).max(20).optional(),
  })
  .strict()
  .meta({ id: 'UpdateProfileBody' });

export const ReplaceLinksBody = z
  .object({ links: z.array(ProfileLinkDto).max(20) })
  .meta({ id: 'ReplaceLinksBody' });

const goalFields = {
  title: z.string().max(200),
  seniority: Seniority,
  targetRoles: z.array(z.string().max(200)).max(30),
  locations: z.array(z.string().max(200)).max(30),
  remoteOnly: z.boolean(),
  salaryMin: z.number().int().nullable(),
  currency: Currency.nullable(),
  salaryPeriod: SalaryPeriod.nullable(),
  isActive: z.boolean(),
};

export const CareerGoalDto = z
  .object({ id: z.uuid(), ...goalFields, createdAt: z.iso.datetime() })
  .meta({ id: 'CareerGoal' });

export const CreateCareerGoalBody = z
  .object({
    ...goalFields,
    targetRoles: goalFields.targetRoles.default([]),
    locations: goalFields.locations.default([]),
    remoteOnly: goalFields.remoteOnly.default(true),
    salaryMin: goalFields.salaryMin.default(null),
    currency: goalFields.currency.default(null),
    salaryPeriod: goalFields.salaryPeriod.default(null),
    isActive: goalFields.isActive.default(true),
  })
  .strict()
  .meta({ id: 'CreateCareerGoalBody' });

export const UpdateCareerGoalBody = z
  .object(goalFields)
  .partial()
  .strict()
  .meta({ id: 'UpdateCareerGoalBody' });
