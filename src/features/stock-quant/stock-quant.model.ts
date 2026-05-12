import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { SkuTable } from "@/features/master-data/sku.model";
import { RacksTable } from "../master-data/racks.model";
import { OrganizationsTable } from "../master-data/organization.model";

export const StockQuantTable = MainSchema.table('stock_quant', {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    skuId: uuid('sku_id').notNull().references(() => SkuTable.skuId),
    description: text('description'),
    quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull().default('0'),
    rackId: uuid('rack_id').notNull().references(() => RacksTable.rackId),
    organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid('created_by').notNull(),
    updatedBy: uuid('updated_by'),
});