ALTER TABLE "main"."es_item_receipts" ADD COLUMN "po_number" varchar(50);--> statement-breakpoint
UPDATE "main"."es_item_receipts"
SET "po_number" = LEFT(NULLIF(TRIM(BOTH FROM payload->>'createdfrom'), ''), 50);
