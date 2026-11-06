CREATE TYPE "public"."material_kind" AS ENUM('resume', 'cover_letter', 'form_answers');--> statement-breakpoint
CREATE TYPE "public"."material_status" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "application_materials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"application_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "material_kind" NOT NULL,
	"status" "material_status" DEFAULT 'generating' NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content" jsonb,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_materials" ADD CONSTRAINT "application_materials_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_materials" ADD CONSTRAINT "application_materials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_materials_application_id_kind_index" ON "application_materials" USING btree ("application_id","kind");