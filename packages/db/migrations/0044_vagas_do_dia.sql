CREATE TABLE "daily_job_picks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"goal_id" uuid,
	"items" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_job_picks_user_day" UNIQUE("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "daily_job_picks" ADD CONSTRAINT "daily_job_picks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_job_picks_user_id_created_at_index" ON "daily_job_picks" USING btree ("user_id","created_at");--> statement-breakpoint
-- Vagas do dia: cada usuário só acessa as próprias (RLS).
GRANT SELECT, INSERT, UPDATE, DELETE ON daily_job_picks TO linkediner_app;--> statement-breakpoint
ALTER TABLE daily_job_picks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE daily_job_picks FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY daily_job_picks_owner ON daily_job_picks TO linkediner_app
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
