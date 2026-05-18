import { MainSchema } from '@/db/db.schema';
import { uuid, text, timestamp, boolean, numeric } from 'drizzle-orm/pg-core';
import { RacksTable } from '@/features/master-data/racks.model';

/**
 * Bins Table
 *
 * @description A bin is a specific slot inside a rack.
 * Tracks capacity and whether it is a pick-face (front-row accessible).
 *
 * @field binId           - Primary key
 * @field rackId          - FK to m_racks
 * @field binCode         - Unique code within the rack (e.g. A-2-3)
 * @field level           - Vertical position in the rack
 * @field column          - Horizontal position in the rack
 * @field capacityVolume  - Max volume this bin can hold
 * @field capacityWeight  - Max weight this bin can hold
 * @field currentVolume   - Current volume used
 * @field currentWeight   - Current weight used
 * @field isPickFace      - Whether this bin is a front-row pick-face slot
 */
export const BinsTable = MainSchema.table('m_bins', {
  binId:          uuid('bin_id').defaultRandom().notNull().primaryKey(),
  rackId:         uuid('rack_id').notNull().references(() => RacksTable.rackId),
  binCode:        text('bin_code').notNull(),
  level:          text('level').notNull(),
  column:         text('column').notNull(),
  capacityVolume: numeric('capacity_volume', { precision: 10, scale: 3 }),
  capacityWeight: numeric('capacity_weight', { precision: 10, scale: 3 }),
  currentVolume:  numeric('current_volume', { precision: 10, scale: 3 }).notNull().default('0'),
  currentWeight:  numeric('current_weight', { precision: 10, scale: 3 }).notNull().default('0'),
  isPickFace:     boolean('is_pick_face').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type BinType = typeof BinsTable.$inferSelect;
export type BinInsertType = typeof BinsTable.$inferInsert;
