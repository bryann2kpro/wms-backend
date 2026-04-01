ALTER TABLE "main"."purchase_orders" ADD COLUMN "amount" numeric(12, 2) DEFAULT '0.00' NOT NULL;

--> statement-breakpoint
WITH po_item_totals AS (
  SELECT
    poi."purchase_order_no",
    COALESCE(SUM(poi."qty_required"), 0)::numeric AS "total_qty"
  FROM "main"."purchase_order_items" poi
  GROUP BY poi."purchase_order_no"
),
computed_po_amounts AS (
  SELECT
    po."id" AS "po_id",
    ROUND(
      (
        GREATEST(
          COALESCE(pit."total_qty", 0),
          COALESCE(rp."min_qty", 5)
        ) * COALESCE(rp."rate", 0) * (1 + COALESCE(rp."sst_rate", 0.06))
      )::numeric,
      2
    ) AS "amount"
  FROM "main"."purchase_orders" po
  LEFT JOIN po_item_totals pit
    ON pit."purchase_order_no" = po."purchase_order_no"
  LEFT JOIN "main"."m_outlet" o
    ON o."outlet_id" = po."outlet_id"
  LEFT JOIN "main"."m_region_pricing" rp
    ON rp."region_id" = o."region_id"
   AND rp."is_active" = true
)
UPDATE "main"."purchase_orders" po
SET "amount" = cpa."amount"
FROM computed_po_amounts cpa
WHERE cpa."po_id" = po."id";
--> statement-breakpoint
ALTER TABLE "main"."purchase_orders" ALTER COLUMN "amount" SET DEFAULT 0.00;
--> statement-breakpoint
UPDATE "main"."purchase_orders" SET "amount" = 0.00 WHERE "amount" IS NULL;
--> statement-breakpoint
ALTER TABLE "main"."purchase_orders" ALTER COLUMN "amount" SET NOT NULL;