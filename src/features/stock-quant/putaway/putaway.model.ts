import { MainSchema } from "@/db/db.schema";
import { numeric, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";
import { SkuTable } from "@/features/master-data/sku.model";
import { RacksTable } from "@/features/master-data/racks.model";

/** Putaway bin-transfer request: Draft → Approved, Fail (after failed transfer), or Reject (no transfer). */
export const PutawayTable = MainSchema.table("putaway", {
  id: uuid("id").defaultRandom().notNull().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => OrganizationsTable.organizationId),
  skuId: uuid("sku_id")
    .notNull()
    .references(() => SkuTable.skuId),
  lotNo: text("lot_no"),
  description: text("description"),
  sourceRackId: uuid("source_rack_id")
    .notNull()
    .references(() => RacksTable.rackId),
  destinationRackId: uuid("destination_rack_id")
    .notNull()
    .references(() => RacksTable.rackId),
  /** Snapshot of the stock_quant row id at draft time (row may be removed after transfer). */
  sourceStockQuantId: uuid("source_stock_quant_id").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
  failureMessage: text("failure_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by").notNull(),
  updatedBy: uuid("updated_by"),
});

export type PutawayType = typeof PutawayTable.$inferSelect;
export type PutawayInsertType = typeof PutawayTable.$inferInsert;

export const PUTAWAY_STATUS = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  FAIL: "FAIL",
  REJECT: "REJECT",
} as const;

export type PutawayStatusValue = (typeof PUTAWAY_STATUS)[keyof typeof PUTAWAY_STATUS];
