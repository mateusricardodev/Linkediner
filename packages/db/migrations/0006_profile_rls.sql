-- Perfil, links e objetivos: cada usuário só acessa os próprios registros (RLS).
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles, profile_links, career_goals TO linkediner_app;--> statement-breakpoint

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY profiles_owner ON profiles TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());--> statement-breakpoint

ALTER TABLE profile_links ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE profile_links FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY profile_links_owner ON profile_links TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());--> statement-breakpoint

ALTER TABLE career_goals ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE career_goals FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY career_goals_owner ON career_goals TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
