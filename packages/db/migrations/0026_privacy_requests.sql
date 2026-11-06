CREATE TYPE "public"."data_export_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."deletion_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "data_exports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "data_export_status" DEFAULT 'pending' NOT NULL,
	"object_key" text,
	"size_bytes" bigint,
	"failure_code" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deletion_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"user_ref" text NOT NULL,
	"status" "deletion_status" DEFAULT 'pending' NOT NULL,
	"report" jsonb,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_exports_user_id_created_at_index" ON "data_exports" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "data_exports_expires_at_index" ON "data_exports" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_requests_user_id_index" ON "deletion_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "deletion_requests_status_requested_at_index" ON "deletion_requests" USING btree ("status","requested_at");