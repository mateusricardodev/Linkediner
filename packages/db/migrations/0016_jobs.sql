CREATE TYPE "public"."job_status" AS ENUM('structuring', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."remote_policy" AS ENUM('remote', 'hybrid', 'onsite', 'unknown');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"status" "job_status" DEFAULT 'structuring' NOT NULL,
	"failure_code" text,
	"raw_text" text NOT NULL,
	"apply_url" text,
	"dedupe_hash" text NOT NULL,
	"title" text,
	"company" text,
	"location" text,
	"employment_type" text,
	"salary_text" text,
	"remote_policy" "remote_policy",
	"seniority" "seniority",
	"must_have" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nice_to_have" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_user_id_created_at_index" ON "jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_user_id_dedupe_hash_index" ON "jobs" USING btree ("user_id","dedupe_hash");