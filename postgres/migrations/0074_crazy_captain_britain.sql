ALTER TABLE "main"."inventory_movements" ADD COLUMN "lot_no" text;--> statement-breakpoint
ALTER TABLE "main"."inventory_movements" ADD COLUMN "expiry_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."stock_adjustment_items" ADD COLUMN "lot_no" text;--> statement-breakpoint
ALTER TABLE "main"."stock_adjustment_items" ADD COLUMN "expiry_date" timestamp with time zone;