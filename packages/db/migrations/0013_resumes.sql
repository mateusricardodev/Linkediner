CREATE TYPE "public"."resume_status" AS ENUM('generating', 'draft', 'failed');--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "resume_status" DEFAULT 'generating' NOT NULL,
	"content" jsonb,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resumes_user_id_created_at_index" ON "resumes" USING btree ("user_id","created_at");