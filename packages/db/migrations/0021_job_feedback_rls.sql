-- Avaliações de vagas: cada usuário só acessa as próprias (RLS).
GRANT SELECT, INSERT, DELETE ON job_feedback TO linkediner_app;--> statement-breakpoint
ALTER TABLE job_feedback ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE job_feedback FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY job_feedback_owner ON job_feedback TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
