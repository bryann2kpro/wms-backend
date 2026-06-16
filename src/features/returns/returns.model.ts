import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";
import { SkuTable } from "@/features/master-data/sku.model";
import { RacksTable } from "@/features/master-data/racks.model";

/**
 * Returns Table (header)
 *
 * @description Per-DO return document. Lorry drivers receive returned goods at ES
 * outlets (damaged or about-to-expire) when delivering. One return per delivery
 * order, captured during the proof-of-delivery flow (or via standalone createReturn).
 * No stock is written at capture time — goods are still on the lorry. Stock is
 * re-entered when a warehouse keeper assigns each item to a rack.
 *
 * @field returnNo - Auto-generated reference: RTN-YYYYMMDD-0001
 * @field doId - The delivery order this return belongs to (UNIQUE — one return per DO)
 * @field doNo / purchaseOrderId / poNo - Denormalized DO/PO references for display
 * @field receivedBy - Driver who captured the return at the outlet
 *
 * @status (text so a PENDING_REVIEW step can be inserted later without schema change)
 * - RECEIVED: Driver captured the return at the outlet; items pending putaway
 * - COMPLETED: All items assigned to racks by the warehouse keeper
 */
export const ReturnsTable = MainSchema.table('returns', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  returnNo: text('return_no').unique().notNull(),
  doId: uuid('do_id').unique().notNull(),
  doNo: text('delivery_order_no').notNull(),
  purchaseOrderId: uuid('purchase_order_id').notNull(),
  poNo: text('purchase_order_no').notNull(),

  status: text('status').notNull().default('RECEIVED'),
  receivedBy: uuid('received_by').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  notes: text('notes'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by').notNull(),
  updatedBy: uuid('updated_by'),
});

/**
 * Return Items Table (line items)
 *
 * @description One row per returned SKU line. Disposition is deterministic by reason:
 * - ABOUT_TO_EXPIRE: keeper assigns a normal rack → stock_quant credited + RETURN_IN
 *   movement (onHand += qty). Original lot/expiry kept so FEFO picks it first.
 * - DAMAGED: keeper assigns a DAMAGED-zone rack → NO stock_quant credit, only a
 *   RETURN_DAMAGED movement (loss += qty).
 *
 * Photos are stored in the shared `documents` table with docType 'RETURN_PHOTO',
 * refType 'RETURN_ITEM', refId = return item id (same mechanism as SIGNED_DO_PROOF).
 *
 * @field qtyPutaway - Accumulates partial putaways until it reaches qtyReturned
 * @field assignedRackId - Last rack the item was assigned to
 *
 * @status
 * - PENDING: Awaiting (full) putaway by warehouse keeper
 * - ASSIGNED: Fully put away (qtyPutaway >= qtyReturned)
 */
export const ReturnItemsTable = MainSchema.table('return_items', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  returnId: uuid('return_id').notNull().references(() => ReturnsTable.id, { onDelete: 'cascade' }),
  doItemId: uuid('do_item_id'),
  skuId: uuid('sku_id').notNull().references(() => SkuTable.skuId),
  lotNo: text('lot_no'),
  expiryDate: timestamp('expiry_date', { withTimezone: true }),

  qtyReturned: numeric('qty_returned', { precision: 12, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  conditionNotes: text('condition_notes'),

  status: text('status').notNull().default('PENDING'),
  qtyPutaway: numeric('qty_putaway', { precision: 12, scale: 2 }).notNull().default('0'),
  assignedRackId: uuid('assigned_rack_id').references(() => RacksTable.rackId),
  assignedBy: uuid('assigned_by'),
  assignedAt: timestamp('assigned_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by').notNull(),
  updatedBy: uuid('updated_by'),
});

/** Named ReturnDocType (not ReturnType) to avoid clashing with TS's built-in ReturnType<T>. */
export type ReturnDocType = typeof ReturnsTable.$inferSelect;
export type ReturnDocInsertType = typeof ReturnsTable.$inferInsert;
export type ReturnItemType = typeof ReturnItemsTable.$inferSelect;
export type ReturnItemInsertType = typeof ReturnItemsTable.$inferInsert;

export enum ReturnReason {
  DAMAGED = 'DAMAGED',
  ABOUT_TO_EXPIRE = 'ABOUT_TO_EXPIRE',
}

export enum ReturnStatus {
  RECEIVED = 'RECEIVED',
  COMPLETED = 'COMPLETED',
}

export enum ReturnItemStatus {
  PENDING = 'PENDING',
  ASSIGNED = 'ASSIGNED',
}

export type ReturnFilter = {
  id?: string | string[];
  doId?: string;
  status?: string | string[];
  /** Returns that contain at least one item with this reason. */
  reason?: string;
  /** Matches returnNo / doNo / poNo (partial, case-insensitive). */
  search?: string;
  receivedAtFrom?: string;
  receivedAtTo?: string;
};
