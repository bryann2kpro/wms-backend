import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { SkuTable } from "../master-data/sku.model";

/**
 * Inventory Movements Table
 * 
 * @description Record of all inventory movements.
 * Every change to inventory is recorded here for traceability.
 * 
 * @field skuId - Reference to the SKU affected
 * @field movementType - Type of movement (IN, OUT, ADJUSTMENT, TRANSFER, SALE, RETURN, OTHER)
 * @field quantity - Quantity moved
 * @field balanceAfter - Balance after the movement
 * @field referenceId - Reference to the source document
 * @field reason - Reason for the movement
 * @field createdAt - Date and time the movement was created
 * @field createdBy - User who created the movement
 */
export const InventoryMovementsTable = MainSchema.table('inventory_movements', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  skuId: uuid('sku_id').notNull().references(() => SkuTable.skuId),
  movementType: text('movement_type').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 12, scale: 2 }).notNull(),
  referenceNo: text('reference_no'),
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
});

/**
 * Inventory Balances Table
 * 
 * @description Source of truth for inventory levels in the WMS.
 * Tracks on-hand and reserved quantities for each SKU.
 * 
 * @field skuId - Reference to the SKU (unique - one record per SKU)
 * @field onHandQty - Total quantity physically in warehouse
 * @field reservedQty - Quantity reserved for pending orders (not available for new orders)
 * 
 * Available Quantity = onHandQty - reservedQty
 */
export const InventoryBalancesTable = MainSchema.table('inventory_balances', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  skuId: uuid('sku_id').unique().notNull(),
  onHandQty: numeric('on_hand_qty', { precision: 10, scale: 2 }).notNull().default('0'),
  reservedQty: numeric('reserved_qty', { precision: 10, scale: 2 }).notNull().default('0'),

  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Inventory Transactions Table
 * 
 * @description Audit log of all inventory movements.
 * Every change to inventory is recorded here for traceability.
 * 
 * @field skuId - Reference to the SKU affected
 * @field qty - Quantity change (positive for in, negative for out)
 * @field refType - Type of source document (GRN, DO, EXCEPTION, STOCK_COUNT)
 * @field refId - ID of the source document
 * 
 * @txnType Transaction types:
 * - GRN_IN: Goods received from supplier (increases on-hand)
 * - DO_RESERVE: Reserved for delivery order (increases reserved)
 * - DO_RELEASE: Released from reservation (decreases reserved)
 * - DO_OUT: Goods shipped out (decreases on-hand)
 * - ADJUSTMENT: Manual inventory adjustment
 * 
 * @refType Reference types:
 * - GRN: Goods Received Note
 * - DO: Delivery Order
 * - EXCEPTION: Exception record
 * - STOCK_COUNT: Stock count/adjustment
 */
export const InventoryTransactionsTable = MainSchema.table('inventory_transactions', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  txnType: text('txn_type').notNull(),
  refType: text('ref_type').notNull(),
  refId: uuid('ref_id').notNull(),

  skuId: uuid('sku_id').notNull(),
  qty: numeric('qty', { precision: 10, scale: 2 }).notNull(),
  notes: text('notes'),

  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
