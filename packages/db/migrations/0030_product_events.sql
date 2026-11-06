CREATE TABLE "product_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_ref" text NOT NULL,
	"name" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "product_events_user_ref_dedupe_key_index" ON "product_events" USING btree ("user_ref","dedupe_key");--> statement-breakpoint
CREATE INDEX "product_events_name_occurred_at_index" ON "product_events" USING btree ("name","occurred_at");--> statement-breakpoint
CREATE INDEX "product_events_occurred_at_index" ON "product_events" USING btree ("occurred_at");