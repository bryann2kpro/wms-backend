ALTER TABLE "main"."skus" DROP CONSTRAINT "skus_sku_suppliers_supplers_supplier_id_fk";
--> statement-breakpoint
ALTER TABLE "main"."skus" ALTER COLUMN "sku_suppliers" SET DATA TYPE jsonb;