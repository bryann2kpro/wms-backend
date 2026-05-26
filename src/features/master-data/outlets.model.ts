import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp } from "drizzle-orm/pg-core";
import { RegionTable } from "./region.model";
import { OrganizationsTable } from "./organization.model";

/**
 * Outlets Table
 * 
 * @description This table is used to store the Empire Sushi's outlets data.
 * Each outlet can optionally belong to a region for delivery scheduling.
 * 
 * @field outletId - Primary key
 * @field outletName - Display name of the outlet
 * @field outletCode - Unique outlet code
 * @field outletAddress - Address of the outlet
 * @field regionId - Optional FK to regions table (for delivery scheduling)
 */
export const OutletsTable = MainSchema.table('m_outlet', {
  outletId: uuid('outlet_id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  outletName: text('outlet_name').notNull(),
  outletCode: text('outlet_code').unique().notNull(),
  address: text('address'),
  chain: text('chain'),
  channel: text('channel'),
  debtor: text('debtor'),
  regionId: uuid('region_id').references(() => RegionTable.regionId),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type OutletType = typeof OutletsTable.$inferSelect;
export type OutletInsertType = typeof OutletsTable.$inferInsert;