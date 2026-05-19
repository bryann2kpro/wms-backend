import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";
import { SkuTable } from "@/features/master-data/sku.model";
import { RacksTable } from "@/features/master-data/racks.model";

export const PickFaceStrategyTable = MainSchema.table('m_pick_face_strategies', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  skuId: uuid('sku_id').notNull().references(() => SkuTable.skuId),
  storageBinId: uuid('storage_bin_id').notNull().references(() => RacksTable.rackId),
  binType: text('bin_type').notNull().default('FIXED_BIN'),  // FIXED_BIN | DYNAMIC_BIN
  itemCode: text('item_code').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type PickFaceStrategyType = typeof PickFaceStrategyTable.$inferSelect;
export type PickFaceStrategyInsertType = typeof PickFaceStrategyTable.$inferInsert;
