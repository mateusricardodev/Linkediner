ALTER TABLE "resumes" ADD COLUMN "language" text DEFAULT 'pt' NOT NULL;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;