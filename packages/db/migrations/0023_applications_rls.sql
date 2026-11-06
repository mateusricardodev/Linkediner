-- Candidaturas: cada usuário só acessa as próprias (RLS). O histórico é somente de inserção.
GRANT SELECT, INSERT, UPDATE ON applications, manual_tasks TO linkediner_app;--> statement-breakpoint
GRANT SELECT, INSERT ON application_events TO linkediner_app;--> statement-breakpoint
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE applications FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY applications_owner ON applications TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());--> statement-breakpoint
ALTER TABLE application_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE application_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY application_events_owner ON application_events TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());--> statement-breakpoint
ALTER TABLE manual_tasks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE manual_tasks FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY manual_tasks_owner ON manual_tasks TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
