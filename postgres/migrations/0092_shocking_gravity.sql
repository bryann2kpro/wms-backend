ALTER TABLE "main"."delivery_order_items" ADD COLUMN "expiry_date" timestamp;--> statement-breakpoint
ALTER TABLE "main"."delivery_order_items" ADD COLUMN "lot_no" text;--> statement-breakpoint
ALTER TABLE "main"."purchase_order_items" ADD COLUMN "expiry_date" timestamp;--> statement-breakpoint
ALTER TABLE "main"."purchase_order_items" ADD COLUMN "lot_no" text;