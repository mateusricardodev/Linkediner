-- Vagas importadas: cada usuário só acessa as próprias (RLS, ADR 0015).
GRANT SELECT, INSERT, UPDATE, DELETE ON jobs TO linkediner_app;--> statement-breakpoint
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY jobs_owner ON jobs TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
