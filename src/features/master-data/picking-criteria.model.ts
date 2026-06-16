import { MainSchema } from "@/db/db.schema";
import { uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";

export const PickingCriteriaTable = MainSchema.table('m_picking_criteria', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  userId: text('user_id').notNull().default(''),
  category: text('category').notNull().default(''),
  chain: text('chain').notNull().default(''),
  channel: text('channel').notNull().default(''),
  debtor: text('debtor').notNull().default(''),
  deliveryPoint: text('delivery_point').notNull().default(''),
  storageClass: text('storage_class').notNull().default(''),
  brand: text('brand').notNull().default(''),
  itemCategory: text('item_category').notNull().default(''),
  manufacturer: text('manufacturer').notNull().default(''),
  item: text('item').notNull().default(''),
  minExpiryMonth: integer('min_expiry_month').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type PickingCriteriaType = typeof PickingCriteriaTable.$inferSelect;
export type PickingCriteriaInsertType = typeof PickingCriteriaTable.$inferInsert;
