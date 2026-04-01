import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";
import { SkuTable } from "@/features/master-data/sku.model";

/**
 * Stock Count Sessions Table
 *
 * @description Each session represents a point-in-time stock count run.
 * Creating a session captures a snapshot of all SKUs × inventory balances.
 * Discrepancies are reviewed and resolved within the session.
 *
 * @status  'open' = in progress, 'closed' = finalised
 */
export const StockCountSessionsTable = MainSchema.table("stock_count_sessions", {
  id: uuid("id").defaultRandom().notNull().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => OrganizationsTable.organizationId),
  name: text("name").notNull(),
  status: text("status").notNull().default("open"),
  countDate: timestamp("count_date", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  closedBy: uuid("closed_by"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

/**
 * Stock Count Items Table
 *
 * @description One row per SKU per session. Values are snapshotted at session
 * creation time. Operations can then fill in countedQty / countedLossQty,
 * select an action, and approve the line.
 */
export const StockCountItemsTable = MainSchema.table("stock_count_items", {
  id: uuid("id").defaultRandom().notNull().primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => StockCountSessionsTable.id),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => OrganizationsTable.organizationId),
  skuId: uuid("sku_id")
    .notNull()
    .references(() => SkuTable.skuId),

  // Denormalised snapshot
  skuCode: text("sku_code").notNull(),
  skuDescription: text("sku_description").notNull(),
  openingQty: numeric("opening_qty", { precision: 12, scale: 2 }).notNull().default("0"),
  openingLossQty: numeric("opening_loss_qty", { precision: 12, scale: 2 }).notNull().default("0"),
  onHandQty: numeric("on_hand_qty", { precision: 12, scale: 2 }).notNull().default("0"),
  onHandLossQty: numeric("on_hand_loss_qty", { precision: 12, scale: 2 }).notNull().default("0"),
  reservedQty: numeric("reserved_qty", { precision: 12, scale: 2 }).notNull().default("0"),
  qtyDifference: numeric("qty_difference", { precision: 12, scale: 2 }).notNull().default("0"),
  lossQtyDifference: numeric("loss_qty_difference", { precision: 12, scale: 2 }).notNull().default("0"),

  // User-editable resolution fields
  countedQty: numeric("counted_qty", { precision: 12, scale: 2 }),
  countedLossQty: numeric("counted_loss_qty", { precision: 12, scale: 2 }),
  action: text("action"), // 'tally_to_opening' | 'tally_to_stock_count' | 'manual_key_in'
  notes: text("notes"),
  imageUrl: text("image_url"),

  // Approval
  isApproved: boolean("is_approved").notNull().default(false),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StockCountSessionType = typeof StockCountSessionsTable.$inferSelect;
export type StockCountSessionInsertType = typeof StockCountSessionsTable.$inferInsert;
export type StockCountItemType = typeof StockCountItemsTable.$inferSelect;
export type StockCountItemInsertType = typeof StockCountItemsTable.$inferInsert;
