import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { SkuTable } from "@/features/master-data/sku.model";
import { RacksTable } from "@/features/master-data/racks.model";
import { OrganizationsTable } from "@/features/master-data/organization.model";

export const StockQuantTransactionTable = MainSchema.table('stock_quant_transaction', {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    skuId: uuid('sku_id').notNull().references(() => SkuTable.skuId),
    lotNo: text('lot_no'),
    expiryDate: timestamp('expiry_date'),
    description: text('description'),
    quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull().default('0'),
    sourceRackId: uuid('source_rack_id').notNull().references(() => RacksTable.rackId),
    destinationRackId: uuid('destination_rack_id').references(() => RacksTable.rackId),
    type: text('type'),
    organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by'),
});