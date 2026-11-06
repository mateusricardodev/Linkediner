import type { z } from 'zod';
import type {
  ApplicationDto,
  ApplicationState as ApplicationStateSchema,
  DashboardResponse as DashboardSchema,
  MeResponse as MeSchema,
  ProfileScoreResponse as ScoreSchema,
  RecommendationsResponse as RecommendationsSchema,
} from '@linkediner/contracts';

/** Só tipos: os esquemas dos contratos não entram no pacote do navegador. */
export type Me = z.infer<typeof MeSchema>;
export type Dashboard = z.infer<typeof DashboardSchema>;
export type Application = z.infer<typeof ApplicationDto>;
export type ApplicationState = z.infer<typeof ApplicationStateSchema>;
export type ProfileScore = z.infer<typeof ScoreSchema>;
export type Recommendations = z.infer<typeof RecommendationsSchema>;
