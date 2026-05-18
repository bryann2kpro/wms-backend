ALTER TYPE "main"."inventory_movement_type" ADD VALUE 'LOSS_ADJUSTMENT';--> statement-breakpoint
ALTER TABLE "main"."daily_opening_stock" ADD CONSTRAINT "daily_opening_stock_org_date_sku_unique" UNIQUE("organization_id","record_date","sku_id");
