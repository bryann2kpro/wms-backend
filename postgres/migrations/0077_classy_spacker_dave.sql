CREATE TABLE "main"."es_advance_notice_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"api_key_id" uuid,
	"raw_payload" jsonb NOT NULL,
	"status" varchar(30) NOT NULL,
	"error_message" text,
	"advance_notice_id" uuid
);
--> statement-breakpoint
ALTER TABLE "main"."es_advance_notice_log" ADD CONSTRAINT "es_advance_notice_log_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "main"."api_keys"("id") ON DELETE no action ON UPDATE no action;