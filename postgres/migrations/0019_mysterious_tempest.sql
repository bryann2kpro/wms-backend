-- Drop FK constraint if it exists (jsonb can't have FK constraints)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'main' 
    AND table_name = 'skus' 
    AND constraint_name = 'skus_sku_suppliers_supplers_supplier_id_fk'
  ) THEN
    ALTER TABLE "main"."skus" DROP CONSTRAINT "skus_sku_suppliers_supplers_supplier_id_fk";
  END IF;
END $$;--> statement-breakpoint
-- Create helper function for converting uuid[] to jsonb (must be outside DO block)
CREATE OR REPLACE FUNCTION convert_uuid_array_to_jsonb(arr uuid[])
RETURNS jsonb AS $$
BEGIN
  IF arr IS NULL OR array_length(arr, 1) IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'supplierId', elem,
        'originalSkuCode', NULL
      )
    )
    FROM unnest(arr) AS elem
  );
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
-- Convert sku_suppliers to jsonb (handle uuid[] or jsonb[] to jsonb conversion)
DO $$
DECLARE
  col_type text;
  col_udt text;
BEGIN
  -- Get current column type
  SELECT data_type, udt_name INTO col_type, col_udt
  FROM information_schema.columns 
  WHERE table_schema = 'main' 
  AND table_name = 'skus' 
  AND column_name = 'sku_suppliers';
  
  -- If column exists as uuid[] (ARRAY type), convert to jsonb array of objects
  IF col_type = 'ARRAY' AND col_udt = '_uuid' THEN
    ALTER TABLE "main"."skus" ALTER COLUMN "sku_suppliers" SET DATA TYPE jsonb 
    USING convert_uuid_array_to_jsonb(sku_suppliers);
  -- If column exists as jsonb[] (shouldn't happen, but handle it)
  ELSIF col_type = 'ARRAY' AND col_udt = '_jsonb' THEN
    -- Convert jsonb[] to jsonb (take first element or empty array)
    ALTER TABLE "main"."skus" ALTER COLUMN "sku_suppliers" SET DATA TYPE jsonb 
    USING COALESCE(sku_suppliers[1], '[]'::jsonb);
  -- If already jsonb, skip
  ELSIF col_type = 'jsonb' THEN
    NULL; -- Already correct type
  -- If other type exists, try simple conversion
  ELSIF col_type IS NOT NULL THEN
    ALTER TABLE "main"."skus" ALTER COLUMN "sku_suppliers" SET DATA TYPE jsonb 
    USING to_jsonb(sku_suppliers);
  END IF;
END $$;--> statement-breakpoint
-- Clean up helper function
DROP FUNCTION IF EXISTS convert_uuid_array_to_jsonb(uuid[]);