-- Exportações: cada usuário só acessa as próprias (RLS). Sem DELETE: a expiração roda sem contexto de usuário.
-- deletion_requests fica sem nenhum acesso do papel da aplicação, como sessões e identidades de login.
GRANT SELECT, INSERT, UPDATE ON data_exports TO linkediner_app;--> statement-breakpoint
ALTER TABLE data_exports ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE data_exports FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY data_exports_owner ON data_exports TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
