-- Material por vaga: cada usuário só acessa o próprio (RLS).
GRANT SELECT, INSERT, UPDATE, DELETE ON application_materials TO linkediner_app;--> statement-breakpoint
ALTER TABLE application_materials ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE application_materials FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY application_materials_owner ON application_materials TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
