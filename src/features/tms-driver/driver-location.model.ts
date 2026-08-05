import { MainSchema } from "@/db/db.schema";
import { uuid, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { DriversTable } from "./drivers.model";

/**
 * Driver location pings — raw GPS coordinates only (device-native, no
 * Google Geocoding/Directions API involved), sent by tmsmobile every 5
 * minutes while a driver is clocked in. Kept as a full history (not
 * overwritten) so a day's route can be reconstructed later, not just the
 * current position.
 */
export const DriverLocationsTable = MainSchema.table('driver_locations', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  driverId: uuid('driver_id').notNull().references(() => DriversTable.id, { onDelete: 'cascade' }),
  lat: numeric('lat', { precision: 10, scale: 7 }).notNull(),
  lng: numeric('lng', { precision: 10, scale: 7 }).notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('driver_locations_driver_captured_idx').on(table.driverId, table.capturedAt),
]);

export type DriverLocationType = typeof DriverLocationsTable.$inferSelect;
export type DriverLocationInsertType = typeof DriverLocationsTable.$inferInsert;
