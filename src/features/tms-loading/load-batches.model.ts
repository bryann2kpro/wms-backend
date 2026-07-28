import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp, date, jsonb } from "drizzle-orm/pg-core";
import { DriversTable } from "@/features/tms-driver/drivers.model";
import { RegionTable } from "@/features/master-data/region.model";

/**
 * A load batch groups delivery orders sharing an outlet region onto one
 * vehicle/driver — matching TMS's own Loading page (one batch per region per
 * day). Each DO within the batch carries its own staging bin (assigned
 * during Packing) as a per-row attribute, not the batch's identity.
 */
export const LoadBatchesTable = MainSchema.table("load_batches", {
  id: uuid("id").defaultRandom().notNull().primaryKey(),
  date: date("date").notNull(),
  regionId: uuid("region_id").notNull().references(() => RegionTable.regionId),
  driverId: uuid("driver_id").references(() => DriversTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("PENDING_DRIVER"), // PENDING_DRIVER | LOADING | DONE
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  legDurationsSeconds: jsonb("leg_durations_seconds"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type LoadBatchType = typeof LoadBatchesTable.$inferSelect;
export type LoadBatchInsertType = typeof LoadBatchesTable.$inferInsert;
