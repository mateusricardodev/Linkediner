CREATE TYPE "public"."external_job_structure_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "external_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"board_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"location" text NOT NULL,
	"remote_hint" boolean DEFAULT false NOT NULL,
	"apply_url" text NOT NULL,
	"posted_at" timestamp with time zone,
	"raw_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"structure_status" "external_job_structure_status" DEFAULT 'pending' NOT NULL,
	"employment_type" text,
	"salary_text" text,
	"remote_policy" "remote_policy",
	"seniority" "seniority",
	"must_have" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nice_to_have" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text,
	"prompt_version" integer,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"token" text NOT NULL,
	"company" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "job_sources" (
	"key" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'disabled' NOT NULL,
	"terms_reviewed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "external_job_id" uuid;--> statement-breakpoint
ALTER TABLE "external_jobs" ADD CONSTRAINT "external_jobs_board_id_job_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."job_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_boards" ADD CONSTRAINT "job_boards_source_key_job_sources_key_fk" FOREIGN KEY ("source_key") REFERENCES "public"."job_sources"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_jobs_board_id_external_id_index" ON "external_jobs" USING btree ("board_id","external_id");--> statement-breakpoint
CREATE INDEX "external_jobs_posted_at_index" ON "external_jobs" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "external_jobs_structure_status_index" ON "external_jobs" USING btree ("structure_status");--> statement-breakpoint
CREATE UNIQUE INDEX "job_boards_source_key_token_index" ON "job_boards" USING btree ("source_key","token");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_external_job_id_external_jobs_id_fk" FOREIGN KEY ("external_job_id") REFERENCES "public"."external_jobs"("id") ON DELETE set null ON UPDATE no action;