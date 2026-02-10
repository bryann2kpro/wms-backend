-- Drop constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND constraint_name = 'skus_sku_supplier_supplers_supplier_id_fk'
  ) THEN
    ALTER TABLE "main"."skus" DROP CONSTRAINT "skus_sku_supplier_supplers_supplier_id_fk";
  END IF;
END $$;--> statement-breakpoint
-- Drop column if it exists (but only if sku_suppliers doesn't exist yet)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND column_name = 'sku_supplier'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND column_name = 'sku_suppliers'
  ) THEN
    ALTER TABLE "main"."skus" DROP COLUMN "sku_supplier";
  END IF;
END $$;