import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";

/**
 * Map Table
 *
 * @description This table is used to store warehouse map data.
 * A map is a warehouse section that groups Areas.
 *
 * @field mapId - Primary key
 * @field organizationId - Organization this map belongs to
 * @field mapCode - Unique map code
 * @field mapName - Display name of the map
 * @field mapDescription - Optional description of the map
 */
export const MapTable = MainSchema.table('m_maps', {
  mapId: uuid('map_id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  mapCode: text('map_code').notNull(),
  mapName: text('map_name').notNull(),
  mapDescription: text('map_description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type MapType = typeof MapTable.$inferSelect;
export type MapInsertType = typeof MapTable.$inferInsert;
