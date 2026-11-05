CREATE TYPE "public"."fact_type" AS ENUM('experience', 'skill', 'project', 'education', 'certification', 'language', 'achievement');--> statement-breakpoint
CREATE TYPE "public"."fact_verification" AS ENUM('extracted', 'user_confirmed', 'suggested', 'rejected');--> statement-breakpoint
CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"task" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_id" text NOT NULL,
	"prompt_version" integer NOT NULL,
	"input_hash" text NOT NULL,
	"output" jsonb NOT NULL,
	"validation" jsonb NOT NULL,
	"tokens_in" integer NOT NULL,
	"tokens_out" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_facts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"type" "fact_type" NOT NULL,
	"data" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"source_document_id" uuid,
	"source_span" text,
	"verification" "fact_verification" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_facts" ADD CONSTRAINT "profile_facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_facts" ADD CONSTRAINT "profile_facts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_facts" ADD CONSTRAINT "profile_facts_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generations_user_id_created_at_index" ON "ai_generations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_generations_created_at_index" ON "ai_generations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "profile_facts_user_id_index" ON "profile_facts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "profile_facts_source_document_id_index" ON "profile_facts" USING btree ("source_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_facts_profile_id_fingerprint_index" ON "profile_facts" USING btree ("profile_id","fingerprint");