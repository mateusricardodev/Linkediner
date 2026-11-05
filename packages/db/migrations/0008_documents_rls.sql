-- Documentos: cada usuário só acessa os próprios (RLS).
-- A expiração em 30 dias roda no worker com o papel dono do banco (sem contexto de usuário).
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO linkediner_app;--> statement-breakpoint
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE documents FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY documents_owner ON documents TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
