import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";
import { RegionTable } from "@/features/master-data/region.model";

/**
 * Warehouses Table
 *
 * @description Stores SME warehouse master data.
 * Each warehouse record represents a physical storage location.
 *
 * @field warehouseId - Primary key
 * @field warehouseName - Display name of the warehouse
 * @field warehouseCode - Optional unique code for the warehouse
 * @field warehouseAddress - Address of the warehouse
 */
export const WarehousesTable = MainSchema.table("m_warehouses", {
  warehouseId: uuid("warehouse_id").defaultRandom().notNull().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => OrganizationsTable.organizationId),
  regionId: uuid("region_id").references(() => RegionTable.regionId),
  warehouseName: text("warehouse_name").notNull(),
  warehouseCode: text("warehouse_code"),
  warehouseAddress: text("warehouse_address"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export type WarehouseType = typeof WarehousesTable.$inferSelect;
export type WarehouseInsertType = typeof WarehousesTable.$inferInsert;

