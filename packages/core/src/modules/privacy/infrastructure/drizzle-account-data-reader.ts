import { eq, schema, withUserContext, type Database } from '@linkediner/db';
import type { AccountDataReader } from '../application/data-export';

const s = schema;

/**
 * Tudo o que é da pessoa, por tabela. Toda tabela nova com `user_id` precisa entrar aqui ou em
 * `NOT_EXPORTED_TABLES`: um teste de integração confere isso contra o banco.
 */
const TABLES = {
  consents: s.consents,
  profiles: s.profiles,
  profile_links: s.profileLinks,
  career_goals: s.careerGoals,
  profile_facts: s.profileFacts,
  profile_scores: s.profileScores,
  documents: s.documents,
  resumes: s.resumes,
  jobs: s.jobs,
  job_matches: s.jobMatches,
  job_feedback: s.jobFeedback,
  applications: s.applications,
  application_events: s.applicationEvents,
  manual_tasks: s.manualTasks,
  application_materials: s.applicationMaterials,
  ai_generations: s.aiGenerations,
} as const;

export const EXPORTED_TABLES = Object.keys(TABLES);

/** Fora do arquivo de propósito: segredos de login, ou registros sobre a própria exportação e exclusão. */
export const NOT_EXPORTED_TABLES = ['sessions', 'deletion_requests', 'data_exports'];

/** Identidades de login entram só com o provedor: nunca hash de senha ou tokens. */
export const PARTIALLY_EXPORTED_TABLES = ['auth_identities'];

/** Caminho interno no storage: não diz nada à pessoa e não deve circular. */
const stripDocument = <T extends { objectKey: string }>({ objectKey: _key, ...rest }: T) => rest;

export class DrizzleAccountDataReader implements AccountDataReader {
  constructor(private readonly db: Database) {}

  async read(userId: string) {
    const { rows, user } = await withUserContext(this.db, userId, async (tx) => {
      const [user] = await tx
        .select({
          id: s.users.id,
          email: s.users.email,
          name: s.users.name,
          locale: s.users.locale,
          timezone: s.users.timezone,
          dataRegion: s.users.dataRegion,
          createdAt: s.users.createdAt,
        })
        .from(s.users)
        .where(eq(s.users.id, userId));
      const rows: Record<string, unknown[]> = {};
      for (const [name, table] of Object.entries(TABLES)) {
        rows[name] = await tx.select().from(table).where(eq(table.userId, userId));
      }
      return { rows, user };
    });
    // O papel da aplicação não acessa as identidades. Só estes campos saem daqui.
    const identities = await this.db
      .select({
        providerId: s.authIdentities.providerId,
        createdAt: s.authIdentities.createdAt,
      })
      .from(s.authIdentities)
      .where(eq(s.authIdentities.userId, userId));

    const documents = rows.documents as (typeof s.documents.$inferSelect)[];
    return {
      data: {
        ...rows,
        user,
        auth_identities: identities,
        documents: documents.map(stripDocument),
      },
      files: documents
        .filter((d) => d.status !== 'pending_upload')
        .map((d) => ({ id: d.id, objectKey: d.objectKey, mimeType: d.mimeType })),
    };
  }
}
