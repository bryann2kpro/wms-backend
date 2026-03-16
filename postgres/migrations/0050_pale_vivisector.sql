ALTER TABLE "main"."invoices" ADD COLUMN IF NOT EXISTS "do_no" text;

UPDATE "main"."invoices" AS i
SET "do_no" = d."delivery_order_no"
FROM "main"."delivery_orders" AS d
WHERE
  d."purchase_order_id" = i."po_id"
  AND d."organization_id" = i."organization_id"
  AND (i."do_no" IS NULL OR i."do_no" = '');