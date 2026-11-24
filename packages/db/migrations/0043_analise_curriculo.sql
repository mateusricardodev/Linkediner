CREATE TYPE "public"."resume_analysis_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "resume_analyses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid,
	"status" "resume_analysis_status" DEFAULT 'processing' NOT NULL,
	"failure_code" text,
	"score" integer,
	"result" jsonb,
	"target_role" text,
	"done_actions" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_analyses" ADD CONSTRAINT "resume_analyses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_analyses" ADD CONSTRAINT "resume_analyses_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resume_analyses_user_id_created_at_index" ON "resume_analyses" USING btree ("user_id","created_at");--> statement-breakpoint
-- Análises de currículo: cada usuário só acessa as próprias (RLS).
GRANT SELECT, INSERT, UPDATE, DELETE ON resume_analyses TO linkediner_app;--> statement-breakpoint
ALTER TABLE resume_analyses ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE resume_analyses FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY resume_analyses_owner ON resume_analyses TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());--> statement-breakpoint
-- Limite por plano: análises de currículo por mês.
INSERT INTO plan_entitlements (plan_id, feature_key, limit_value, period)
SELECT p.id, 'resume.analysis', CASE p.key WHEN 'free' THEN 2 WHEN 'pro' THEN 20 ELSE 60 END, 'month'
FROM plans p
ON CONFLICT DO NOTHING;
