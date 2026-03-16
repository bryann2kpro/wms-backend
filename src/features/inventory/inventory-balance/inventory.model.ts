import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { SkuTable } from "../../master-data/sku.model";
import { OrganizationsTable } from "@/features/master-data/organization.model";

/**
 * Inventory Balances Table
 * 
 * @description Source of truth for inventory levels in the WMS.
 * Tracks on-hand and reserved quantities for each SKU.
 * 
 * @field skuId - Reference to the SKU (unique - one record per SKU)
 * @field skuCode - SKU code
 * @field recordDate - Date and time the balance was calculated
 * @field onHandQty - Total quantity physically in warehouse
 * @field reservedQty - Quantity reserved for pending orders (not available for new orders)
 * 
 * Available Quantity = onHandQty - reservedQty
 */
export const InventoryBalancesTable = MainSchema.table('inventory_balances', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  skuId: uuid('sku_id').unique().notNull().references(() => SkuTable.skuId).unique(),
  onHandQty: numeric('on_hand_qty', { precision: 12, scale: 2 }).notNull().default('0'),
  lossQty: numeric('loss_qty', { precision: 12, scale: 2 }).notNull().default('0'),
  reservedQty: numeric('reserved_qty', { precision: 12, scale: 2 }).notNull().default('0'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});