-- Currículos gerados: cada usuário só acessa os próprios (RLS).
GRANT SELECT, INSERT, UPDATE, DELETE ON resumes TO linkediner_app;--> statement-breakpoint
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE resumes FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY resumes_owner ON resumes TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
