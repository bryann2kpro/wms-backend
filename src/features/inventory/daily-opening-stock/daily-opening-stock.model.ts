import { MainSchema } from "@/db/db.schema";
import { uuid, date, numeric, timestamp, unique } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";
import { SkuTable } from "@/features/master-data/sku.model";

/**
 * Daily Opening Stock Table
 *
 * @description Snapshot of inventory balances captured at midnight each day
 * via a scheduled cron job. Used as the reference opening quantity when a
 * stock count session is created.
 *
 * @field organizationId - Tenant isolation
 * @field recordDate    - The date this snapshot represents (DATE, not TIMESTAMPTZ)
 * @field skuId         - The SKU being snapshotted
 * @field openingQty    - On-hand quantity at snapshot time
 * @field openingLossQty - Loss quantity at snapshot time
 */
export const DailyOpeningStockTable = MainSchema.table(
  "daily_opening_stock",
  {
    id: uuid("id").defaultRandom().notNull().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => OrganizationsTable.organizationId),
    recordDate: date("record_date").notNull(),
    skuId: uuid("sku_id")
      .notNull()
      .references(() => SkuTable.skuId),
    openingQty: numeric("opening_qty", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    openingLossQty: numeric("opening_loss_qty", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("daily_opening_stock_org_date_sku_unique").on(
      t.organizationId,
      t.recordDate,
      t.skuId
    ),
  ]
);

export type DailyOpeningStockType = typeof DailyOpeningStockTable.$inferSelect;
export type DailyOpeningStockInsertType =
  typeof DailyOpeningStockTable.$inferInsert;
