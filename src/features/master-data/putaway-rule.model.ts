import { MainSchema } from '@/db/db.schema';
import { uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { WarehousesTable } from '@/features/master-data/warehouses.model';

/**
 * Putaway Rules Table
 *
 * @description Rules that map item attributes to a target zone purpose.
 * The putaway engine reads these to suggest the correct bin for incoming goods.
 *
 * Example: item_attribute_key=category, item_attribute_value=wet → target_zone_purpose=WET
 *
 * @field putawayRuleId         - Primary key
 * @field warehouseId           - FK to m_warehouses (rule is warehouse-specific)
 * @field itemAttributeKey      - The item attribute to match on (e.g. "category")
 * @field itemAttributeValue    - The value to match (e.g. "wet")
 * @field targetZonePurpose     - Target zone purpose (e.g. "WET") or specific zone_id
 * @field priority              - Lower number = higher priority when multiple rules match
 */
export const PutawayRulesTable = MainSchema.table('m_putaway_rules', {
  putawayRuleId:       uuid('putaway_rule_id').defaultRandom().notNull().primaryKey(),
  warehouseId:         uuid('warehouse_id').notNull().references(() => WarehousesTable.warehouseId),
  itemAttributeKey:    text('item_attribute_key').notNull(),
  itemAttributeValue:  text('item_attribute_value').notNull(),
  targetZonePurpose:   text('target_zone_purpose').notNull(),
  priority:            integer('priority').notNull().default(100),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type PutawayRuleType = typeof PutawayRulesTable.$inferSelect;
export type PutawayRuleInsertType = typeof PutawayRulesTable.$inferInsert;
