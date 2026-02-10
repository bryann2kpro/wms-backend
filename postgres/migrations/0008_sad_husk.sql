ALTER TABLE "main"."skus" ADD COLUMN "sku_expiry_date" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."skus" ADD COLUMN "sku_supplier" text NOT NULL;