import type { z } from 'zod';
import type {
  ApplicationDetail as ApplicationDetailSchema,
  ApplicationDto,
  ApplicationMaterialDto,
  ApplicationState as ApplicationStateSchema,
  BillingSummaryDto,
  CareerGoalDto,
  DashboardResponse as DashboardSchema,
  DocumentDto,
  DocumentKind as DocumentKindSchema,
  FeedbackReason as FeedbackReasonSchema,
  JobDto,
  JobMatchResponse,
  MeResponse as MeSchema,
  ProfileFactDto,
  ProfileScoreResponse as ScoreSchema,
  RecommendationsResponse as RecommendationsSchema,
  RequestUploadResponse as RequestUploadSchema,
  ResumeContentDto,
  ResumeDto,
  ResumeItemDto,
} from '@linkediner/contracts';

/** Só tipos: os esquemas dos contratos não entram no pacote do navegador. */
export type Me = z.infer<typeof MeSchema>;
export type Dashboard = z.infer<typeof DashboardSchema>;
export type Application = z.infer<typeof ApplicationDto>;
export type ApplicationState = z.infer<typeof ApplicationStateSchema>;
export type ProfileScore = z.infer<typeof ScoreSchema>;
export type Recommendations = z.infer<typeof RecommendationsSchema>;
export type DocumentRecord = z.infer<typeof DocumentDto>;
export type DocumentKind = z.infer<typeof DocumentKindSchema>;
export type RequestUpload = z.infer<typeof RequestUploadSchema>;
export type ProfileFact = z.infer<typeof ProfileFactDto>;
export type Resume = z.infer<typeof ResumeDto>;
export type ResumeContent = z.infer<typeof ResumeContentDto>;
export type ResumeItem = z.infer<typeof ResumeItemDto>;
export type Job = z.infer<typeof JobDto>;
export type JobMatch = z.infer<typeof JobMatchResponse>;
export type FeedbackReason = z.infer<typeof FeedbackReasonSchema>;
export type ApplicationDetail = z.infer<typeof ApplicationDetailSchema>;
export type ApplicationMaterial = z.infer<typeof ApplicationMaterialDto>;
export interface CoverLetterContent {
  paragraphs: ResumeItem[];
}
export interface FormAnswersContent {
  answers: { question: string; answer: ResumeItem | null }[];
}
export type BillingSummary = z.infer<typeof BillingSummaryDto>;
export type CareerGoal = z.infer<typeof CareerGoalDto>;
