import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";
import { SkuTable } from "@/features/master-data/sku.model";
import { RacksTable } from "@/features/master-data/racks.model";

/**
 * Stock Adjustments Table (header)
 *
 * @description Records stock adjustment events for manual inventory corrections.
 * Each adjustment can contain multiple line items; the same SKU may appear on
 * multiple lines when lot number and/or expiry differ.
 * Adjustments are applied immediately on creation (no approval workflow).
 *
 * @field adjustmentNo - Auto-generated reference: ADJ-YYYYMMDD-0001
 * @field reason - Free-text reason for the adjustment
 * @field notes - Additional notes
 */
export const StockAdjustmentsTable = MainSchema.table('stock_adjustments', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  adjustmentNo: text('adjustment_no').unique().notNull(),
  reason: text('reason'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by').notNull(),
  updatedBy: uuid('updated_by'),
});

export type StockAdjustmentType = typeof StockAdjustmentsTable.$inferSelect;
export type StockAdjustmentInsertType = typeof StockAdjustmentsTable.$inferInsert;

/**
 * Stock Adjustment Items Table (line items)
 *
 * @description Each row records a single SKU adjustment within a parent stock adjustment.
 *
 * @field movementType - ADJUSTMENT (add/subtract onHand) or DAMAGED (subtract onHand, add loss)
 * @field quantity - For ADJUSTMENT: positive to increase, negative to decrease onHand.
 *                   For DAMAGED: always positive (subtracted from onHand, added to loss).
 * @field remarks - Per-line reason/notes
 * @field rackId - Bin location this adjustment applies to (WMS capture; balances remain SKU-level)
 * @field lotNo - Supplier/manufacturer lot for this line (optional)
 * @field expiryDate - Expiry for this lot line (optional)
 */
export const StockAdjustmentItemsTable = MainSchema.table('stock_adjustment_items', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  stockAdjustmentId: uuid('stock_adjustment_id').notNull().references(() => StockAdjustmentsTable.id),
  skuId: uuid('sku_id').notNull().references(() => SkuTable.skuId),
  rackId: uuid('rack_id').references(() => RacksTable.rackId),
  lotNo: text('lot_no'),
  expiryDate: timestamp('expiry_date', { withTimezone: true }),
  movementType: text('movement_type').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull(),
  remarks: text('remarks'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by').notNull(),
});

export type StockAdjustmentItemType = typeof StockAdjustmentItemsTable.$inferSelect;
export type StockAdjustmentItemInsertType = typeof StockAdjustmentItemsTable.$inferInsert;
