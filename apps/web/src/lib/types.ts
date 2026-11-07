import type { z } from 'zod';
import type {
  ApplicationDto,
  ApplicationState as ApplicationStateSchema,
  DashboardResponse as DashboardSchema,
  DocumentDto,
  DocumentKind as DocumentKindSchema,
  MeResponse as MeSchema,
  ProfileFactDto,
  ProfileScoreResponse as ScoreSchema,
  RecommendationsResponse as RecommendationsSchema,
  RequestUploadResponse as RequestUploadSchema,
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
