-- Fatos do perfil e gerações de IA: cada usuário só acessa os próprios registros (RLS).
GRANT SELECT, INSERT, UPDATE, DELETE ON profile_facts TO linkediner_app;--> statement-breakpoint
ALTER TABLE profile_facts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE profile_facts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY profile_facts_owner ON profile_facts TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());--> statement-breakpoint

-- Registro de IA: a aplicação insere e lê, mas não altera. A retenção de 90 dias roda no worker como dono do banco.
GRANT SELECT, INSERT ON ai_generations TO linkediner_app;--> statement-breakpoint
ALTER TABLE ai_generations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ai_generations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY ai_generations_owner ON ai_generations TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
