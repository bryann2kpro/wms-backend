-- Skip this migration if column doesn't exist or is already uuid[]
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND column_name = 'sku_supplier'
    AND data_type != 'ARRAY'
  ) THEN
    -- Convert based on current type
    IF EXISTS (
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
    ELSE
      ALTER TABLE "main"."skus" ALTER COLUMN "sku_supplier" SET DATA TYPE uuid[] USING ARRAY[sku_supplier::text]::uuid[];
    END IF;
  END IF;
END $$;