import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Region Table
 * 
 * @description This table is used to store the SME Ederan regions data.
 * Regions are used to group outlets for delivery scheduling purposes.
 * 
 * @field regionId - Primary key
 * @field regionName - Display name of the region (e.g., "Klang Valley", "North", "South", "East Coast", "Perlis")
 * @field regionCode - Unique short code for the region (e.g., "KV", "NORTH", "SOUTH", "EC", "PERLIS")
 */
export const RegionTable = MainSchema.table('regions', {
  regionId: uuid('region_id').defaultRandom().notNull().primaryKey(),
  regionName: text('region_name').notNull(),
  regionCode: text('region_code').unique().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type RegionType = typeof RegionTable.$inferSelect;
export type RegionInsertType = typeof RegionTable.$inferInsert;

/**
 * Region Codes
 * @description Available region codes in the system
 */
export const RegionCode = {
  KLANG_VALLEY: 'KV',
  PERLIS: 'PERLIS',
  NORTH: 'NORTH',
  SOUTH: 'SOUTH',
  EAST_COAST: 'EC',
} as const;

export type RegionCodeType = typeof RegionCode[keyof typeof RegionCode];