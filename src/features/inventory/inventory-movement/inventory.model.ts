import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { SkuTable } from "../../master-data/sku.model";
import { RegionTable } from "@/features/master-data/region.model";
import { RacksTable } from "@/features/master-data/racks.model";
import { StockAdjustmentsTable } from "@/features/inventory/stock-adjustment/stock-adjustment.model";

// NOTE: this Postgres enum is APPEND-ONLY. Never reorder or remove existing values;
// new values (e.g. Bin-to-Bin TRANSFER_OUT/TRANSFER_IN) must be appended AFTER
// RETURN_DAMAGED at the end of the list.
const InventoryMovementTypeEnum = MainSchema.enum('inventory_movement_type', [
  'INBOUND', // Inventory received from a supplier
  'RESERVED', // Inventory reserved for a shipment
  'SHIPMENT', // Truck left warehouse
  'ADJUSTMENT', // Stock count correction
  'DAMAGED', // Found broken item
  'LOSS_ADJUSTMENT', // Stock count loss correction
  'RETURN_IN', // About-to-expire goods returned from outlet, re-entered into stock
  'RETURN_DAMAGED', // Damaged goods returned from outlet, recorded as loss
  'TRANSFER_OUT', // Stock transfer: debited from source rack
  'TRANSFER_IN', // Stock transfer: credited to destination rack
]);

export enum InventoryMovementType {
  INBOUND = 'INBOUND', // Inventory received from a supplier
  RESERVED = 'RESERVED', // Inventory reserved for a shipment
  SHIPMENT = 'SHIPMENT', // Truck left warehouse
  ADJUSTMENT = 'ADJUSTMENT', // Stock count correction
  DAMAGED = 'DAMAGED', // Found broken item
  LOSS_ADJUSTMENT = 'LOSS_ADJUSTMENT', // Stock count loss correction
  TRANSFER_OUT = 'TRANSFER_OUT', // Stock transfer: debited from source rack
  TRANSFER_IN = 'TRANSFER_IN', // Stock transfer: credited to destination rack
  RETURN_IN = 'RETURN_IN', // About-to-expire goods returned from outlet, re-entered into stock
  RETURN_DAMAGED = 'RETURN_DAMAGED', // Damaged goods returned from outlet, recorded as loss
};

/**
 * Inventory Movements Table
 * 
 * @description Record of all inventory movements.
 * Every change to inventory is recorded here for traceability.
 * 
 * @field skuId - Reference to the SKU affected
 * @field movementType - Type of movement (INBOUND, OUTBOUND, ADJUSTMENT, TRANSFER, SALE, RETURN, OTHER)
 * @field quantity - Quantity moved
 * @field balanceAfter - Balance after the movement
 * @field referenceNo - Human-readable reference (e.g. adjustment number)
 * @field stockAdjustmentId - FK when movement originated from a stock adjustment (nullable for INBOUND, etc.)
 * @field rackId - Bin location when recorded (e.g. stock adjustments)
 * @field lotNo - Lot traceability when applicable (e.g. adjustments)
 * @field expiryDate - Expiry for the lot line when applicable
 * @field reason - Reason for the movement
 * @field createdAt - Date and time the movement was created
 * @field createdBy - User who created the movement
 */
export const InventoryMovementsTable = MainSchema.table('inventory_movements', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  skuId: uuid('sku_id').notNull().references(() => SkuTable.skuId),
  regionId: uuid('region_id').references(() => RegionTable.regionId),
  movementType: InventoryMovementTypeEnum('movement_type').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull(),
  lossQty: numeric('loss_qty', { precision: 12, scale: 2 }).default('0'),
  balanceAfter: numeric('balance_after', { precision: 12, scale: 2 }).default('0'),
  referenceNo: text('reference_no'),
  stockAdjustmentId: uuid('stock_adjustment_id').references(() => StockAdjustmentsTable.id),
  rackId: uuid('rack_id').references(() => RacksTable.rackId),
  lotNo: text('lot_no'),
  expiryDate: timestamp('expiry_date', { withTimezone: true }),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
});



