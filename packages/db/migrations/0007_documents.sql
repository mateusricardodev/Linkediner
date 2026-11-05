CREATE TYPE "public"."document_kind" AS ENUM('resume', 'linkedin_pdf');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('pending_upload', 'uploaded', 'processing', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"status" "document_status" DEFAULT 'pending_upload' NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text,
	"uploaded_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_objectKey_unique" UNIQUE("object_key")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_user_id_created_at_index" ON "documents" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_expires_at_index" ON "documents" USING btree ("expires_at");