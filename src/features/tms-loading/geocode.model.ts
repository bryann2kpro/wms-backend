import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, timestamp } from "drizzle-orm/pg-core";

/**
 * Geocode cache — lat/lng for outlets and the warehouse depot, keyed by
 * entityType+entityId. Mirrors TMS's own tms_loading_geocode table so a
 * future data sync stays trivial. Populated on demand via Google Maps
 * Geocoding API, never re-requested once cached.
 */
export const GeocodeTable = MainSchema.table("geocode_cache", {
  id: uuid("id").defaultRandom().notNull().primaryKey(),
  entityType: text("entity_type").notNull(), // 'outlet' | 'warehouse'
  entityId: text("entity_id").notNull(), // outlet UUID, or 'warehouse'
  label: text("label"),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type GeocodeType = typeof GeocodeTable.$inferSelect;
