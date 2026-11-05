-- Compatibilidade: cada usuário só acessa os próprios cálculos (RLS).
GRANT SELECT, INSERT, UPDATE ON job_matches TO linkediner_app;--> statement-breakpoint
ALTER TABLE job_matches ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE job_matches FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY job_matches_owner ON job_matches TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
