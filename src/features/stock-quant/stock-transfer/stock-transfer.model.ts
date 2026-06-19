import { MainSchema } from "@/db/db.schema";
import { numeric, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";
import { SkuTable } from "@/features/master-data/sku.model";
import { RacksTable } from "@/features/master-data/racks.model";
import { WarehousesTable } from "@/features/master-data/warehouses.model";

/**
 * Stock transfer type.
 * - BIN_TO_BIN: source and destination racks resolve to the same warehouse
 *   (or both racks are unzoned). Completes instantly in one transaction.
 * - WAREHOUSE_TO_WAREHOUSE: source and destination resolve to different
 *   warehouses. Models in-transit state (debit source on dispatch, credit
 *   destination on receive).
 */
export const StockTransferTypeEnum = MainSchema.enum("stock_transfer_type", [
  "BIN_TO_BIN",
  "WAREHOUSE_TO_WAREHOUSE",
]);

/**
 * Stock transfer status.
 * - DRAFT: saved, awaiting approval; no stock movement yet.
 * - AWAITING_DISPATCH: W2W approved, awaiting source dispatch (no stock moved yet).
 *   TJ: run pnpm run migrate (adds enum value)
 * - IN_TRANSIT: dispatched, awaiting receive (source debited). B2B on approve; W2W on dispatch.
 * - COMPLETED: terminal. B2B on receive; W2W on receive.
 * - CANCELLED: terminal. IN_TRANSIT cancel re-credits source; AWAITING_DISPATCH cancel is no-op.
 */
export const StockTransferStatusEnum = MainSchema.enum("stock_transfer_status", [
  "DRAFT",
  "AWAITING_DISPATCH",
  "IN_TRANSIT",
  "COMPLETED",
  "CANCELLED",
]);

/**
 * Stock Transfers Table (header)
 *
 * @description Document header for a bin-to-bin or warehouse-to-warehouse stock
 * move. Reuses putaway move mechanics with the gaps fixed (reserved-qty aware,
 * warehouse-aware, writes inventory_movements). Org-level inventory_balances are
 * never touched by transfers (TRANSFER_OUT/TRANSFER_IN are balance no-ops).
 *
 * @field transferNo - Auto-generated reference: TRF-YYYYMMDD-0001
 * @field type - BIN_TO_BIN | WAREHOUSE_TO_WAREHOUSE
 * @field status - IN_TRANSIT | COMPLETED | CANCELLED
 * @field sourceWarehouseId/destinationWarehouseId - Derived warehouse for the
 *        racks on this transfer. Nullable: unzoned racks have no warehouse.
 */
export const StockTransfersTable = MainSchema.table("stock_transfers", {
  id: uuid("id").defaultRandom().notNull().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => OrganizationsTable.organizationId),
  transferNo: text("transfer_no").unique().notNull(),
  type: StockTransferTypeEnum("type").notNull(),
  status: StockTransferStatusEnum("status").notNull(),
  sourceWarehouseId: uuid("source_warehouse_id").references(() => WarehousesTable.warehouseId),
  destinationWarehouseId: uuid("destination_warehouse_id").references(() => WarehousesTable.warehouseId),
  remarks: text("remarks"),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  receivedBy: uuid("received_by"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: uuid("cancelled_by"),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by").notNull(),
  updatedBy: uuid("updated_by"),
});

export type StockTransferType = typeof StockTransfersTable.$inferSelect;
export type StockTransferInsertType = typeof StockTransfersTable.$inferInsert;

/**
 * Stock Transfer Items Table (line items)
 *
 * @description One row per SKU+lot+expiry move from a source rack to a
 * destination rack. The same SKU may appear on multiple lines when lot/expiry
 * differ.
 *
 * @field sourceStockQuantId - Snapshot of the source stock_quant row id at
 *        create time (the row may be deleted once it reaches zero qty).
 */
export const StockTransferItemsTable = MainSchema.table("stock_transfer_items", {
  id: uuid("id").defaultRandom().notNull().primaryKey(),
  stockTransferId: uuid("stock_transfer_id")
    .notNull()
    .references(() => StockTransfersTable.id),
  skuId: uuid("sku_id")
    .notNull()
    .references(() => SkuTable.skuId),
  lotNo: text("lot_no"),
  expiryDate: timestamp("expiry_date", { withTimezone: true }),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  /** Loose units moved on this line. TJ: run `pnpm run migrate` */
  lossQuantity: numeric("loss_quantity", { precision: 12, scale: 2 }).notNull().default("0"),
  sourceRackId: uuid("source_rack_id")
    .notNull()
    .references(() => RacksTable.rackId),
  destinationRackId: uuid("destination_rack_id")
    .notNull()
    .references(() => RacksTable.rackId),
  sourceStockQuantId: uuid("source_stock_quant_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by").notNull(),
});

export type StockTransferItemType = typeof StockTransferItemsTable.$inferSelect;
export type StockTransferItemInsertType = typeof StockTransferItemsTable.$inferInsert;

export const STOCK_TRANSFER_TYPE = {
  BIN_TO_BIN: "BIN_TO_BIN",
  WAREHOUSE_TO_WAREHOUSE: "WAREHOUSE_TO_WAREHOUSE",
} as const;

export type StockTransferTypeValue =
  (typeof STOCK_TRANSFER_TYPE)[keyof typeof STOCK_TRANSFER_TYPE];

export const STOCK_TRANSFER_STATUS = {
  DRAFT: "DRAFT",
  AWAITING_DISPATCH: "AWAITING_DISPATCH",
  IN_TRANSIT: "IN_TRANSIT",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type StockTransferStatusValue =
  (typeof STOCK_TRANSFER_STATUS)[keyof typeof STOCK_TRANSFER_STATUS];
