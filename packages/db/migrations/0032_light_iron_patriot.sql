ALTER TABLE "documents" ADD COLUMN "discarded_facts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "dropped_fields" integer DEFAULT 0 NOT NULL;