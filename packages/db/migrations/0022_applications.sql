CREATE TYPE "public"."application_actor" AS ENUM('user', 'system', 'source');--> statement-breakpoint
CREATE TYPE "public"."application_state" AS ENUM('recommended', 'saved', 'analyzing', 'in_review', 'awaiting_approval', 'approved', 'sending', 'sent', 'failed', 'blocked_by_source', 'manual_action_required', 'interview_received', 'rejected', 'closed');--> statement-breakpoint
CREATE TYPE "public"."submission_mode" AS ENUM('api', 'assisted', 'manual');--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"application_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"from_state" "application_state",
	"to_state" "application_state" NOT NULL,
	"actor" "application_actor" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid,
	"job_snapshot" jsonb NOT NULL,
	"state" "application_state" NOT NULL,
	"resume_id" uuid,
	"material_snapshot" jsonb,
	"submission_mode" "submission_mode",
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"application_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_tasks" ADD CONSTRAINT "manual_tasks_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_tasks" ADD CONSTRAINT "manual_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_events_application_id_created_at_index" ON "application_events" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_user_id_job_id_index" ON "applications" USING btree ("user_id","job_id");--> statement-breakpoint
CREATE INDEX "applications_user_id_state_index" ON "applications" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "manual_tasks_application_id_index" ON "manual_tasks" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "manual_tasks_user_id_resolved_at_index" ON "manual_tasks" USING btree ("user_id","resolved_at");