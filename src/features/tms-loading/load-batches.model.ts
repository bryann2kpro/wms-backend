import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp, date, jsonb } from "drizzle-orm/pg-core";
import { DriversTable } from "@/features/tms-driver/drivers.model";

/**
 * A load batch groups delivery orders sharing a staging bin (assigned during
 * Packing) onto one vehicle/driver. Mirrors TMS's tms_loadlist table, minus
 * the region/priority-tier grouping we intentionally skipped for v1.
 */
export const LoadBatchesTable = MainSchema.table("load_batches", {
  id: uuid("id").defaultRandom().notNull().primaryKey(),
  date: date("date").notNull(),
  zone: text("zone").notNull(), // = the staging bin value this batch was created from
  driverId: uuid("driver_id").references(() => DriversTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("PENDING_DRIVER"), // PENDING_DRIVER | LOADING | DONE
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  legDurationsSeconds: jsonb("leg_durations_seconds"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type LoadBatchType = typeof LoadBatchesTable.$inferSelect;
export type LoadBatchInsertType = typeof LoadBatchesTable.$inferInsert;
