import { MainSchema } from "@/db/db.schema";
import {
  uuid,
  text,
  numeric,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";
import { SkuTable } from "@/features/master-data/sku.model";
import { GrnItemsTable } from "@/features/inbound/grns.model";
import { InventoryBalancesTable } from "@/features/inventory/inventory-balance/inventory.model";

/**
 * Customer Priority Table
 *
 * @description Tenant-wide ranked list of customers used by the allocation
 * engine to decide who gets reserved stock first. In SME, "customer" maps to
 * `m_outlet.chain` (e.g. ES, LH, UAB). A lower rank number = higher priority.
 *
 * One row per (organization_id, customer_code). The rank is unique per tenant
 * so two customers cannot share the same rank.
 */
export const CustomerPriorityTable = MainSchema.table(
  "customer_priority",
  {
    id: uuid("id").defaultRandom().notNull().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => OrganizationsTable.organizationId),
    customerCode: text("customer_code").notNull(),
    customerName: text("customer_name"),
    rank: integer("rank").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by"),
  },
  (t) => ({
    uniqOrgCustomer: uniqueIndex("customer_priority_org_customer_uniq").on(
      t.organizationId,
      t.customerCode,
    ),
    uniqOrgRank: uniqueIndex("customer_priority_org_rank_uniq").on(
      t.organizationId,
      t.rank,
    ),
  }),
);

/**
 * Stock Reservations Table
 *
 * @description A reservation holds qty against a SKU (and optionally a specific
 * batch / GRN item) for a given customer during a time window. Reserved qty is
 * subtracted from available-to-promise so the allocation engine cannot promise
 * the same units twice.
 *
 * Reservation grain:
 *  - SKU-level: `grn_item_id` is NULL — holds qty against any batch of the SKU.
 *  - Batch-level: `grn_item_id` set — holds qty against a specific GRN line
 *    (lot / expiry). Use this when a customer needs a particular batch.
 *
 * Lifecycle / status:
 *  - ACTIVE: currently reducing ATP.
 *  - CONSUMED: fully drawn down by a DO allocation.
 *  - EXPIRED: reserve_end passed before fully consumed.
 *  - CANCELLED / RELEASED: manually voided; qty returns to ATP.
 */
export const StockReservationsTable = MainSchema.table(
  "stock_reservations",
  {
    id: uuid("id").defaultRandom().notNull().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => OrganizationsTable.organizationId),
    reservationNo: text("reservation_no").unique().notNull(),

    /** Customer this reservation is held for. Mirrors customer_priority.customer_code. */
    customerCode: text("customer_code").notNull(),

    skuId: uuid("sku_id")
      .notNull()
      .references(() => SkuTable.skuId),

    /** NULL = SKU-level reservation; non-NULL = pinned to a specific GRN batch line. */
    grnItemId: uuid("grn_item_id").references(() => GrnItemsTable.id),

    /**
     * Denormalized FK to inventory_balances so balance maintenance / triggers can
     * locate the affected row in one hop. Required because every reservation
     * must correspond to an existing balance row (one per SKU per org).
     */
    inventoryBalanceId: uuid("inventory_balance_id")
      .notNull()
      .references(() => InventoryBalancesTable.id),

    qtyReserved: numeric("qty_reserved", { precision: 12, scale: 2 }).notNull(),
    qtyConsumed: numeric("qty_consumed", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),

    /** Window during which this reservation reduces ATP. */
    reserveStart: timestamp("reserve_start", { withTimezone: true }).notNull(),
    reserveEnd: timestamp("reserve_end", { withTimezone: true }).notNull(),

    /**
     * Overrides batch picking order — when allocating against this reservation,
     * flagged batches are consumed first regardless of FIFO/LIFO/FEFO.
     */
    priorityFlag: boolean("priority_flag").notNull().default(false),

    status: text("status").notNull().default("ACTIVE"),

    /** Provenance: e.g. 'PO' / 'DO' / 'MANUAL', plus the originating doc id. */
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by"),
  },
  (t) => ({
    /** Hot path: "what's reserved for this SKU right now?" */
    activeBySku: index("stock_reservations_sku_status_window_idx").on(
      t.skuId,
      t.status,
      t.reserveStart,
      t.reserveEnd,
    ),
    byCustomer: index("stock_reservations_customer_status_idx").on(
      t.organizationId,
      t.customerCode,
      t.status,
    ),
    byBatch: index("stock_reservations_grn_item_idx").on(t.grnItemId),
  }),
);

export type CustomerPriorityType = typeof CustomerPriorityTable.$inferSelect;
export type CustomerPriorityInsertType =
  typeof CustomerPriorityTable.$inferInsert;

export type StockReservationType = typeof StockReservationsTable.$inferSelect;
export type StockReservationInsertType =
  typeof StockReservationsTable.$inferInsert;

export type StockReservationFilter = {
  id?: string | string[];
  reservationNo?: string;
  customerCode?: string | string[];
  skuId?: string | string[];
  grnItemId?: string | string[];
  status?: string | string[];
  activeAt?: string;
};
