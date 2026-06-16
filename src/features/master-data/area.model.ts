import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";
import { MapTable } from "./map.model";
import { WarehousesTable } from "./warehouses.model";

/**
 * Areas Table
 *
 * @description This table is used to store warehouse zone (area) data.
 * Each area groups Storage Bins and optionally belongs to a Map.
 *
 * @field areaId - Primary key
 * @field organizationId - FK to organizations (multi-tenant)
 * @field mapId - Optional FK to map (area can exist without a map initially)
 * @field areaCode - Unique area code
 * @field areaName - Display name of the area
 * @field areaDescription - Optional description of the area
 */
export const AreaTable = MainSchema.table('m_warehouse_areas', {
  areaId: uuid('area_id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  warehouseId: uuid('warehouse_id').notNull().references(() => WarehousesTable.warehouseId),
  mapId: uuid('map_id').references(() => MapTable.mapId),
  areaCode: text('area_code').notNull(),
  areaName: text('area_name').notNull(),
  areaDescription: text('area_description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type AreaType = typeof AreaTable.$inferSelect;
export type AreaInsertType = typeof AreaTable.$inferInsert;
