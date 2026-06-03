import { MainSchema } from '@/db/db.schema';
import { uuid, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { WarehousesTable } from '@/features/master-data/warehouses.model';

export const ZonePurposeEnum = pgEnum('zone_purpose', [
  'GENERAL',
  'WET',
  'DRY',
  'AMBIENT',
  'DAMAGED',
]);

/**
 * Zones Table
 *
 * @description Physical zones inside a warehouse, each with a purpose.
 * Used by the putaway engine to route goods to the correct area.
 *
 * @field zoneId      - Primary key
 * @field warehouseId - FK to m_warehouses
 * @field zoneCode    - Short unique code within the warehouse
 * @field zoneName    - Display name
 * @field purpose     - Zone classification (GENERAL / WET / DRY / AMBIENT / DAMAGED)
 */
export const ZonesTable = MainSchema.table('m_zones', {
  zoneId:      uuid('zone_id').defaultRandom().notNull().primaryKey(),
  warehouseId: uuid('warehouse_id').notNull().references(() => WarehousesTable.warehouseId),
  zoneCode:    text('zone_code').notNull(),
  zoneName:    text('zone_name').notNull(),
  purpose:     ZonePurposeEnum('purpose').notNull().default('GENERAL'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type ZoneType = typeof ZonesTable.$inferSelect;
export type ZoneInsertType = typeof ZonesTable.$inferInsert;
