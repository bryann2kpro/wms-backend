import { MainSchema } from "@/db/db.schema";
import { uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { OutletsTable } from "@/features/master-data/outlets.model";
import { SkuTable } from "@/features/master-data/sku.model";
import { OrganizationsTable } from "@/features/master-data/organization.model";

export const SkuAssignmentTable = MainSchema.table('sku_assignments', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  outletId: uuid('outlet_id').notNull().references(() => OutletsTable.outletId),
  skuId: uuid('sku_id').notNull().references(() => SkuTable.skuId),
  minExpiryMonth: integer('min_expiry_month').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type SkuAssignmentType = typeof SkuAssignmentTable.$inferSelect;
export type SkuAssignmentInsertType = typeof SkuAssignmentTable.$inferInsert;
