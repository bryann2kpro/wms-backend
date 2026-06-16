import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp, varchar, boolean, numeric } from "drizzle-orm/pg-core";
import { RegionTable } from "./region.model";
import { OrganizationsTable } from "@/features/master-data/organization.model";
import { ZonesTable } from "@/features/master-data/zone.model";
import { AreaTable } from "@/features/master-data/area.model";
import { WarehousesTable } from "@/features/master-data/warehouses.model";

/**
 * Racks Table
 * 
 * @description This table is used to store the Empire Sushi's racks data.
 * Each rack can optionally belong to a region for delivery scheduling.
 * 
 * @field rackId - Primary key
 * @field rackName - Display name of the rack
 * @field rackCode - Unique rack code
 * @field rackDescription - Description of the rack
 * @field rackType - Type of the rack
 * @field rackCapacity - Capacity of the rack
 */
export const RacksTable = MainSchema.table('m_racks', {
  rackId: uuid('rack_id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  /** Direct warehouse link (nullable). Preferred over deriving warehouse via zone/area. */
  warehouseId: uuid('warehouse_id').references(() => WarehousesTable.warehouseId),
  zoneId: uuid('zone_id').references(() => ZonesTable.zoneId),
  rackRow: varchar('rack_row').notNull(),
  rackColumn: varchar('rack_column').notNull(),
  rackLevel: varchar('rack_level').notNull(),
  areaId: uuid('area_id').references(() => AreaTable.areaId),
  binType: text('bin_type').notNull().default('FIXED'),
  binCode: text('bin_code'),
  barCode: text('bar_code'),
  length: numeric('length', { precision: 12, scale: 3 }),
  width: numeric('width', { precision: 12, scale: 3 }),
  height: numeric('height', { precision: 12, scale: 3 }),
  weight: numeric('weight', { precision: 12, scale: 3 }),
  maxPallet: numeric('max_pallets', { precision: 12, scale: 3 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull()
});

export type RackType = typeof RacksTable.$inferSelect;
export type RackInsertType = typeof RacksTable.$inferInsert;