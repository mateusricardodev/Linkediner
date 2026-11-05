-- Histórico do score: cada usuário só acessa o próprio. A aplicação insere e lê, mas não altera.
GRANT SELECT, INSERT ON profile_scores TO linkediner_app;--> statement-breakpoint
ALTER TABLE profile_scores ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE profile_scores FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY profile_scores_owner ON profile_scores TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
