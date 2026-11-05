CREATE TYPE "public"."feedback_reason" AS ENUM('liked', 'disliked', 'too_senior', 'misaligned', 'salary_mismatch', 'location_mismatch', 'tech_mismatch', 'company_blocked', 'already_applied', 'more_like_this');--> statement-breakpoint
CREATE TABLE "job_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid,
	"reason" "feedback_reason" NOT NULL,
	"job_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_feedback" ADD CONSTRAINT "job_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_feedback" ADD CONSTRAINT "job_feedback_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_feedback_user_id_index" ON "job_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "job_feedback_job_id_index" ON "job_feedback" USING btree ("job_id");