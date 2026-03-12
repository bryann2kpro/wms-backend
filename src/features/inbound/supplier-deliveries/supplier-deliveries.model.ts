import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";

/**
 * Supplier Deliveries Table
 * 
 * @description Stores inbound delivery records from suppliers to SME warehouse.
 * When a supplier delivers goods to SME, this record captures the delivery details.
 * 
 * @field supplierId - Reference to the supplier making the delivery
 * @field supplierDeliveryNo - Unique delivery number from the supplier
 * @field invoiceToAddressId - Address snapshot for invoice recipient (ES)
 * @field deliverToAddressId - Address snapshot for delivery destination (SME)
 * 
 * @status
 * - RECEIVED_DRAFT: Initial state when delivery is received but not yet confirmed
 * - RECEIVED_CONFIRMED: Delivery has been verified and confirmed
 * - CLOSED: Delivery processing is complete
 */
export const SupplierDeliveriesTable = MainSchema.table('supplier_deliveries', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  supplierId: uuid('supplier_id').notNull(),
  supplierDeliveryNo: text('supplier_delivery_no').unique().notNull(),
  deliveryDate: timestamp('delivery_date').notNull(),
  transporter: text('transporter'),
  lorryPlate: text('lorry_plate'),

  invoiceToAddressId: uuid('invoice_to_address_id'),
  deliverToAddressId: uuid('deliver_to_address_id'),

  account: text('account'),
  poNo: text('po_no'),
  jtNo: text('jt_no'),
  orderDate: timestamp('order_date'),

  status: text('status').notNull().default('RECEIVED_DRAFT'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: uuid('created_by').notNull(),
  updatedBy: uuid('updated_by'),
});

export type SupplierDeliveriesType = typeof SupplierDeliveriesTable.$inferSelect;
export type SupplierDeliveriesInsertType = typeof SupplierDeliveriesTable.$inferInsert;

/**
 * Supplier Delivery Items Table
 * 
 * @description Line items for each supplier delivery.
 * Each record represents a specific SKU delivered as part of a supplier delivery.
 * 
 * @field supplierDeliveryId - Reference to the parent supplier delivery
 * @field skuId - Reference to the SKU being delivered
 * @field itemId - Supplier's item identifier
 * @field itemName - Supplier's item name/description
 * @field qtyDelivered - Actual quantity delivered
 * @field qtyOrdered - Originally ordered quantity
 * @field qtyToFollow - Quantity pending for future delivery
 */
export const SupplierDeliveryItemsTable = MainSchema.table('supplier_delivery_items', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  supplierDeliveryId: uuid('supplier_delivery_id').notNull(),
  skuId: uuid('sku_id').notNull(),
  itemId: text('item_id'),
  itemName: text('item_name'),
  qtyDelivered: numeric('qty_delivered', { precision: 10, scale: 2 }).notNull(),
  lossQty: numeric('loss_qty', { precision: 10, scale: 2 }).notNull().default('0'),
  qtyOrdered: numeric('qty_ordered', { precision: 10, scale: 2 }),
  qtyToFollow: numeric('qty_to_follow', { precision: 10, scale: 2 }),
  remarks: text('remarks'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: uuid('created_by').notNull(),
  updatedBy: uuid('updated_by'),
});

export type SupplierDeliveryItemType = typeof SupplierDeliveryItemsTable.$inferSelect;
export type SupplierDeliveryItemInsertType = typeof SupplierDeliveryItemsTable.$inferInsert;
