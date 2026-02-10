-- Set NOT NULL if column exists and is nullable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND column_name = 'sku_supplier'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "main"."skus" ALTER COLUMN "sku_supplier" SET NOT NULL;
  END IF;
  
  -- Skip FK constraint - PostgreSQL doesn't support foreign keys on array columns
  -- The column will be uuid[] which cannot have a foreign key constraint
END $$;