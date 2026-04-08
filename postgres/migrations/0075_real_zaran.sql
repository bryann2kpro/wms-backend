CREATE TABLE "main"."es_item_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"es_advance_notice_id" uuid,
	"payload" jsonb NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ns_response" jsonb
);
--> statement-breakpoint
ALTER TABLE "main"."es_item_receipts" ADD CONSTRAINT "es_item_receipts_es_advance_notice_id_es_advance_notices_id_fk" FOREIGN KEY ("es_advance_notice_id") REFERENCES "main"."es_advance_notices"("id") ON DELETE no action ON UPDATE no action;