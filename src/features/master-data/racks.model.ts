import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { RegionTable } from "./region.model";

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
export const RacksTable = MainSchema.table('racks', {
  rackId: uuid('rack_id').defaultRandom().notNull().primaryKey(),
  rackRow: varchar('rack_row').notNull(),
  rackColumn: varchar('rack_column').notNull(),
  rackLevel: varchar('rack_level').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull()
});

export type RackType = typeof RacksTable.$inferSelect;
export type RackInsertType = typeof RacksTable.$inferInsert;