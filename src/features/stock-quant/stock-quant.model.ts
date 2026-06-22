import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { SkuTable } from "@/features/master-data/sku.model";
import { RacksTable } from "../master-data/racks.model";
import { OrganizationsTable } from "../master-data/organization.model";

export const StockQuantTable = MainSchema.table('stock_quant', {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    skuId: uuid('sku_id').notNull().references(() => SkuTable.skuId),
    lotNo: text('lot_no'),
    expiryDate: timestamp('expiry_date'),
    description: text('description'),
    quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull().default('0'),
    /** Loose units on this quant row (mirrors inventory_balances.loss_qty). */
    lossQty: numeric('loss_qty', { precision: 12, scale: 2 }).notNull().default('0'),
    reservedQty: numeric('reserved_qty', { precision: 12, scale: 2 }).notNull().default('0'),
    rackId: uuid('rack_id').notNull().references(() => RacksTable.rackId),
    organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by'),
}, (t) => ({
    /** Rack capacity usage: aggregate quantity per rack within a tenant. */
    byOrgRack: index("stock_quant_org_rack_idx").on(t.organizationId, t.rackId),
}));