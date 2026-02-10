-- Add sku_suppliers column if it doesn't exist (using plural to match model)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND column_name = 'sku_suppliers'
  ) THEN
    ALTER TABLE "main"."skus" ADD COLUMN "sku_suppliers" uuid[] NOT NULL;
  END IF;
END $$;