ALTER TABLE "main"."es_advance_notices" ADD COLUMN "linked_grn_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."grns" ADD COLUMN "advance_notice_id" uuid;--> statement-breakpoint
ALTER TABLE "main"."grns" ADD CONSTRAINT "grns_advance_notice_id_es_advance_notices_id_fk" FOREIGN KEY ("advance_notice_id") REFERENCES "main"."es_advance_notices"("id") ON DELETE no action ON UPDATE no action;