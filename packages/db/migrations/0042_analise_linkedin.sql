CREATE TYPE "public"."linkedin_analysis_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "linkedin_analyses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid,
	"status" "linkedin_analysis_status" DEFAULT 'processing' NOT NULL,
	"failure_code" text,
	"score" integer,
	"result" jsonb,
	"target_role" text,
	"done_actions" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linkedin_analyses" ADD CONSTRAINT "linkedin_analyses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_analyses" ADD CONSTRAINT "linkedin_analyses_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "linkedin_analyses_user_id_created_at_index" ON "linkedin_analyses" USING btree ("user_id","created_at");--> statement-breakpoint
-- Análises do LinkedIn: cada usuário só acessa as próprias (RLS).
GRANT SELECT, INSERT, UPDATE, DELETE ON linkedin_analyses TO linkediner_app;--> statement-breakpoint
ALTER TABLE linkedin_analyses ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE linkedin_analyses FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY linkedin_analyses_owner ON linkedin_analyses TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());--> statement-breakpoint
-- Limites por plano: análises por mês e o texto pronto para colar (só nos planos pagos).
INSERT INTO plan_entitlements (plan_id, feature_key, limit_value, period)
SELECT p.id, f.feature_key, CASE p.key WHEN 'free' THEN f.free WHEN 'pro' THEN f.pro ELSE f.advanced END, f.period
FROM plans p
CROSS JOIN (VALUES
  ('linkedin.analysis', 2, 20, 60, 'month'),
  ('linkedin.rewrites', 0, 1, 1, NULL)
) AS f(feature_key, free, pro, advanced, period)
ON CONFLICT DO NOTHING;
