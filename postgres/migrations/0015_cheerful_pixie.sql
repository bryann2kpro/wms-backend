-- Handle sku_supplier to sku_suppliers conversion and type change
DO $$
BEGIN
  -- If sku_supplier exists and needs to be converted/renamed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND column_name = 'sku_supplier'
  ) THEN
    -- Drop FK constraint if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE table_schema = 'main' 
      AND table_name = 'skus' 
      AND constraint_name = 'skus_sku_supplier_supplers_supplier_id_fk'
    ) THEN
      ALTER TABLE "main"."skus" DROP CONSTRAINT "skus_sku_supplier_supplers_supplier_id_fk";
    END IF;
    
    -- Convert type if needed, then rename
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'main' 
      AND table_name = 'skus' 
      AND column_name = 'sku_supplier'
      AND data_type = 'jsonb'
    ) THEN
      -- Convert from jsonb to uuid[]
      ALTER TABLE "main"."skus" ALTER COLUMN "sku_supplier" SET DATA TYPE uuid[] USING (
        CASE 
          WHEN jsonb_typeof(sku_supplier) = 'array' 
          THEN ARRAY(SELECT jsonb_array_elements_text(sku_supplier))::uuid[]
          ELSE ARRAY[sku_supplier::text]::uuid[]
        END
      );
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'main' 
      AND table_name = 'skus' 
      AND column_name = 'sku_supplier'
      AND data_type != 'ARRAY'
    ) THEN
      -- Convert from other type to uuid[]
      ALTER TABLE "main"."skus" ALTER COLUMN "sku_supplier" SET DATA TYPE uuid[] USING ARRAY[sku_supplier::text]::uuid[];
    END IF;
    
    -- Rename to plural (only if sku_suppliers doesn't already exist)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'main' 
      AND table_name = 'skus' 
      AND column_name = 'sku_suppliers'
    ) THEN
      ALTER TABLE "main"."skus" RENAME COLUMN "sku_supplier" TO "sku_suppliers";
    ELSE
      -- If both exist, drop the singular one
      ALTER TABLE "main"."skus" DROP COLUMN "sku_supplier";
    END IF;
  END IF;
  
  -- Drop the invalid FK constraint on array column (PostgreSQL doesn't support FKs on arrays)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND constraint_name = 'skus_sku_suppliers_supplers_supplier_id_fk'
  ) THEN
    ALTER TABLE "main"."skus" DROP CONSTRAINT "skus_sku_suppliers_supplers_supplier_id_fk";
  END IF;
END $$;--> statement-breakpoint