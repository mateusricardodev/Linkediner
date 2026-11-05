-- Isolamento entre usuários no banco (docs/arquitetura/02-arquitetura-geral.md, multi-tenancy).
-- A aplicação define app.current_user_id na transação. Sem essa variável, nenhuma linha é visível.

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.current_user_id', true), '')::uuid $$;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app_current_user_id() TO linkediner_app;--> statement-breakpoint

-- users: cada usuário vê e altera apenas a própria linha.
GRANT SELECT, UPDATE ON users TO linkediner_app;--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY users_owner ON users TO linkediner_app
  USING (id = app_current_user_id())
  WITH CHECK (id = app_current_user_id());--> statement-breakpoint

-- consents: histórico somente de inserção. O usuário lê e cria os próprios registros.
GRANT SELECT, INSERT ON consents TO linkediner_app;--> statement-breakpoint
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE consents FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY consents_owner ON consents TO linkediner_app
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());--> statement-breakpoint

-- audit_logs: a aplicação só insere. Leitura apenas por papel administrativo (fora do escopo atual).
GRANT INSERT ON audit_logs TO linkediner_app;--> statement-breakpoint
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO linkediner_app WITH CHECK (true);
