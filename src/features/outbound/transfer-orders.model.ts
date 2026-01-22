import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Transfer Orders Table
 * 
 * @description Purchase Orders/Transfer Orders pulled from NetSuite.
 * These represent requests from NetSuite for SME to deliver goods to ES branches.
 * SME pulls these orders and creates Delivery Orders to fulfill them.
 * 
 * @field netsuiteToId - Unique identifier from NetSuite
 * @field toNo - Transfer Order number
 * @field outletId - Reference to the destination outlet/branch
 * @field requestedDeliveryDate - Customer requested delivery date
 * @field scheduledDeliveryDate - Actual scheduled delivery date
 * @field rawPayload - Original JSON payload from NetSuite for reference
 * @field pulledAt - Timestamp when the order was pulled from NetSuite
 * 
 * @status
 * - NEW: Order just pulled from NetSuite
 * - ACCEPTED: Order accepted by SME for fulfillment
 * - REJECTED: Order rejected (e.g., cannot fulfill)
 * - DO_CREATED: Delivery Order has been created for this TO
 * - CANCELLED: Order cancelled
 */
export const TransferOrdersTable = MainSchema.table('transfer_orders', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  netsuiteToId: text('netsuite_to_id').unique().notNull(),
  toNo: text('to_no').unique().notNull(),
  outletId: uuid('outlet_id').notNull(),

  requestedDeliveryDate: timestamp('requested_delivery_date'),
  scheduledDeliveryDate: timestamp('scheduled_delivery_date'),

  status: text('status').notNull().default('NEW'),
  rawPayload: jsonb('raw_payload'),

  pulledAt: timestamp('pulled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

/**
 * Transfer Order Items Table
 * 
 * @description Line items for each Transfer Order from NetSuite.
 * Each record represents a specific SKU requested for delivery to an outlet.
 * 
 * @field toId - Reference to the parent Transfer Order
 * @field skuId - Reference to the SKU requested
 * @field qty - Quantity requested
 */
export const TransferOrderItemsTable = MainSchema.table('transfer_order_items', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  toId: uuid('to_id').notNull(),
  skuId: uuid('sku_id').notNull(),
  qty: numeric('qty', { precision: 10, scale: 2 }).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});
