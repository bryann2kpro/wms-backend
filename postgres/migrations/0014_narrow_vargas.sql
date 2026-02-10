-- Add sku_expiry_date if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND column_name = 'sku_expiry_date'
  ) THEN
    ALTER TABLE "main"."skus" ADD COLUMN "sku_expiry_date" timestamp NOT NULL;
  END IF;
END $$;--> statement-breakpoint
-- Handle sku_suppliers column (model uses plural, but migrations may have used singular)
DO $$
BEGIN
  -- If both columns exist, drop the singular one (keep plural)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND column_name = 'sku_supplier'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND column_name = 'sku_suppliers'
  ) THEN
    ALTER TABLE "main"."skus" DROP COLUMN "sku_supplier";
  -- If sku_supplier (singular) exists as jsonb, convert it and rename to sku_suppliers
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND column_name = 'sku_supplier'
    AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE "main"."skus" ALTER COLUMN "sku_supplier" SET DATA TYPE uuid[] USING (
      CASE 
        WHEN jsonb_typeof(sku_supplier) = 'array' 
        THEN ARRAY(SELECT jsonb_array_elements_text(sku_supplier))::uuid[]
        ELSE ARRAY[sku_supplier::text]::uuid[]
      END
    );
    ALTER TABLE "main"."skus" RENAME COLUMN "sku_supplier" TO "sku_suppliers";
  -- If sku_supplier (singular) exists as another type, convert and rename
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND column_name = 'sku_supplier'
  ) THEN
    ALTER TABLE "main"."skus" ALTER COLUMN "sku_supplier" SET DATA TYPE uuid[] USING ARRAY[sku_supplier::text]::uuid[];
    ALTER TABLE "main"."skus" RENAME COLUMN "sku_supplier" TO "sku_suppliers";
  -- If sku_suppliers (plural) exists as jsonb, convert it
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND column_name = 'sku_suppliers'
    AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE "main"."skus" ALTER COLUMN "sku_suppliers" SET DATA TYPE uuid[] USING (
      CASE 
        WHEN jsonb_typeof(sku_suppliers) = 'array' 
        THEN ARRAY(SELECT jsonb_array_elements_text(sku_suppliers))::uuid[]
        ELSE ARRAY[sku_suppliers::text]::uuid[]
      END
    );
  -- If sku_suppliers (plural) exists as another non-array type, convert it
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND column_name = 'sku_suppliers'
    AND data_type != 'ARRAY'
  ) THEN
    ALTER TABLE "main"."skus" ALTER COLUMN "sku_suppliers" SET DATA TYPE uuid[] USING ARRAY[sku_suppliers::text]::uuid[];
  -- If neither exists, add sku_suppliers
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND column_name = 'sku_suppliers'
  ) THEN
    ALTER TABLE "main"."skus" ADD COLUMN "sku_suppliers" uuid[] NOT NULL;
  END IF;
END $$;--> statement-breakpoint