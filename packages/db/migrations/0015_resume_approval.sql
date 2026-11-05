ALTER TYPE "public"."resume_status" ADD VALUE 'approved' BEFORE 'failed';--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "approved_at" timestamp with time zone;