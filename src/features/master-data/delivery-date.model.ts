import { MainSchema } from "@/db/db.schema"
import { text, timestamp, uuid, smallint, boolean, time, unique } from "drizzle-orm/pg-core";
import { RegionTable } from "./region.model";
import { OrganizationsTable } from "@/features/master-data/organization.model";

/**
 * Region Delivery Schedule Table
 * 
 * @description Defines recurring delivery schedules per region.
 * Each entry represents a delivery day for a region with its cutoff configuration.
 * 
 * @field scheduleId - Primary key
 * @field regionId - FK to regions table
 * @field dayOfWeek - Day of week (1=Monday, 2=Tuesday, ..., 7=Sunday) - ISO standard
 * @field cutoffDaysBefore - Number of days before delivery for order cutoff (e.g., 1 = day before)
 * @field cutoffTime - Time of day for order cutoff (e.g., "18:00:00")
 * @field isActive - Whether this schedule is currently active
 * 
 * @example
 * Region: Klang Valley, Day: Tuesday (2), Cutoff: Monday 12:00
 * Region: Klang Valley, Day: Thursday (4), Cutoff: Wednesday 18:00
 */
export const RegionDeliveryScheduleTable = MainSchema.table('region_delivery_schedules', {
  scheduleId: uuid('schedule_id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  regionId: uuid('region_id').notNull().references(() => RegionTable.regionId),
  dayOfWeek: smallint('day_of_week').notNull(), // 1=Monday, 2=Tuesday, ..., 7=Sunday
  cutoffDaysBefore: smallint('cutoff_days_before').notNull().default(1),
  cutoffTime: time('cutoff_time').notNull().default('18:00:00'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
}, (table) => ({
  // Ensure only one schedule per region per day of week
  uniqueRegionDay: unique().on(table.regionId, table.dayOfWeek),
}));

export type RegionDeliveryScheduleType = typeof RegionDeliveryScheduleTable.$inferSelect;
export type RegionDeliveryScheduleInsertType = typeof RegionDeliveryScheduleTable.$inferInsert;

/**
 * Day of Week Constants (ISO standard)
 * @description Day of week values used in delivery schedules
 */
export const DayOfWeek = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 7,
} as const;

export type DayOfWeekType = typeof DayOfWeek[keyof typeof DayOfWeek];

/**
 * Day of Week Labels
 * @description Human-readable labels for days of the week
 */
export const DayOfWeekLabel: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};