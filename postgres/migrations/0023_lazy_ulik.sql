-- Create helper function to convert unit_code text to stock_unit_id uuid
CREATE OR REPLACE FUNCTION convert_unit_code_to_uuid(unit_code_text text)
RETURNS uuid AS $$
DECLARE
  result_uuid uuid;
BEGIN
  SELECT stock_unit_id INTO result_uuid
  FROM "main"."stock_units"
  WHERE unit_code = unit_code_text
  LIMIT 1;
  
  RETURN result_uuid;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
-- Convert sku_unit_of_measurement from text (unit_code) to uuid (stock_unit_id)
DO $$
BEGIN
  -- Check if column exists and is text type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND column_name = 'sku_unit_of_measurement'
    AND data_type = 'text'
  ) THEN
    -- Convert text unit_code to uuid by looking up stock_unit_id
    ALTER TABLE "main"."skus" ALTER COLUMN "sku_unit_of_measurement" SET DATA TYPE uuid 
    USING convert_unit_code_to_uuid(sku_unit_of_measurement);
  -- If already uuid, skip
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND column_name = 'sku_unit_of_measurement'
    AND data_type = 'uuid'
  ) THEN
    NULL; -- Already correct type
  END IF;
END $$;--> statement-breakpoint
-- Drop helper function
DROP FUNCTION IF EXISTS convert_unit_code_to_uuid(text);--> statement-breakpoint
-- Add FK constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND constraint_name = 'skus_sku_unit_of_measurement_stock_units_stock_unit_id_fk'
  ) THEN
    ALTER TABLE "main"."skus" ADD CONSTRAINT "skus_sku_unit_of_measurement_stock_units_stock_unit_id_fk" 
    FOREIGN KEY ("sku_unit_of_measurement") 
    REFERENCES "main"."stock_units"("stock_unit_id") 
    ON DELETE no action 
    ON UPDATE no action;
  END IF;
END $$;