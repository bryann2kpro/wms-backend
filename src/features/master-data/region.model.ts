import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { CountriesTable } from "@/features/master-data/country.model";

/**
 * Region Table
 * 
 * @description This table is used to store the SME Edaran regions data.
 * Regions are used to group outlets for delivery scheduling purposes.
 * 
 * @field regionId - Primary key
 * @field regionName - Display name of the region (e.g., "Klang Valley", "North", "South", "East Coast", "Perlis")
 * @field regionCode - Unique short code for the region (e.g., "KV", "NORTH", "SOUTH", "EC", "PERLIS")
 */
export const RegionTable = MainSchema.table('m_regions', {
  regionId: uuid('region_id').defaultRandom().notNull().primaryKey(),
  countryId: uuid('country_id').notNull().references(() => CountriesTable.countryId),
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
 * Region Pricing Table
 *
 * @description Flat delivery rate per region used when computing invoice line items.
 * One active pricing row per region. The rate is per carton (CTN).
 * If total qty < minQty, charge as if minQty units: effectiveQty × rate.
 * SST is applied on top: totalExclTax × sstRate.
 *
 * @field regionId - FK to regions table
 * @field rate - Delivery rate per CTN (MYR)
 * @field minQty - Minimum qty threshold (default 5)
 * @field sstRate - SST rate as a decimal, e.g. 0.06 = 6% (default 0.06)
 * @field isActive - Whether this pricing row is active
 */
export const RegionPricingTable = MainSchema.table('m_region_pricing', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  regionId: uuid('region_id').notNull().references(() => RegionTable.regionId, { onDelete: 'cascade' }),
  rate: numeric('rate', { precision: 12, scale: 2 }).notNull(),
  minQty: numeric('min_qty', { precision: 10, scale: 2 }).notNull().default('5'),
  sstRate: numeric('sst_rate', { precision: 5, scale: 4 }).notNull().default('0.0600'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type RegionPricingType = typeof RegionPricingTable.$inferSelect;
export type RegionPricingInsertType = typeof RegionPricingTable.$inferInsert;

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