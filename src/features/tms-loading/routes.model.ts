import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, timestamp } from "drizzle-orm/pg-core";

/**
 * Named delivery routes — a simple reference list (name, origin, destination,
 * distance, duration, active/inactive), matching TMS's own Routing page.
 * Standalone: not linked to load batches or DOs, same as TMS's version.
 */
export const RoutesTable = MainSchema.table("tms_routes", {
  id: uuid("id").defaultRandom().notNull().primaryKey(),
  name: text("name").notNull(),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  distanceKm: numeric("distance_km", { precision: 10, scale: 2 }).notNull(),
  estimatedDurationMins: numeric("estimated_duration_mins", { precision: 10, scale: 0 }).notNull(),
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | INACTIVE
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RouteType = typeof RoutesTable.$inferSelect;
export type RouteInsertType = typeof RoutesTable.$inferInsert;
