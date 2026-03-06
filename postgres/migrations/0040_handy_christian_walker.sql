CREATE TABLE "main"."grn_item_racks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grn_item_id" uuid NOT NULL,
	"rack_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main"."grn_items" ADD COLUMN "expiry_date" timestamp;--> statement-breakpoint
ALTER TABLE "main"."skus" ADD COLUMN "sku_batches" jsonb;