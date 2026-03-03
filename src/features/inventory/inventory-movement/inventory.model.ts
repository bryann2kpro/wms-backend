import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { SkuTable } from "../../master-data/sku.model";

const InventoryMovementTypeEnum = MainSchema.enum('inventory_movement_type', [
  'INBOUND', // Inventory received from a supplier
  'RESERVED', // Inventory reserved for a shipment
  'SHIPMENT', // Truck left warehouse
  'ADJUSTMENT', // Stock count correction
  'DAMAGED', // Found broken item
]);

export enum InventoryMovementType {
  INBOUND = 'INBOUND', // Inventory received from a supplier
  RESERVED = 'RESERVED', // Inventory reserved for a shipment
  SHIPMENT = 'SHIPMENT', // Truck left warehouse
  ADJUSTMENT = 'ADJUSTMENT', // Stock count correction
  DAMAGED = 'DAMAGED', // Found broken item
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
 * @field referenceId - Reference to the source document
 * @field reason - Reason for the movement
 * @field createdAt - Date and time the movement was created
 * @field createdBy - User who created the movement
 */
export const InventoryMovementsTable = MainSchema.table('inventory_movements', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  skuId: uuid('sku_id').notNull().references(() => SkuTable.skuId),
  movementType: InventoryMovementTypeEnum('movement_type').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 12, scale: 2 }).notNull(),
  referenceNo: text('reference_no'),
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
});



