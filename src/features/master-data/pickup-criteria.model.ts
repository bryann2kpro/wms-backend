import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";
import { SkuTable } from "@/features/master-data/sku.model";

export const PickupCriteriaTable = MainSchema.table('m_pickup_criteria', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  skuId: uuid('sku_id').notNull().references(() => SkuTable.skuId),
  strategy: text('strategy').notNull().default('FIFO'),  // FIFO | LIFO | FEFO
  priorityOverride: boolean('priority_override').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type PickupCriteriaType = typeof PickupCriteriaTable.$inferSelect;
export type PickupCriteriaInsertType = typeof PickupCriteriaTable.$inferInsert;
