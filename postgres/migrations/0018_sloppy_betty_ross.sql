ALTER TABLE "main"."skus" ALTER COLUMN "sku_expiry_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."skus" ALTER COLUMN "sku_suppliers" SET DATA TYPE jsonb[];