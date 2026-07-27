import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { DriversTable } from "./drivers.model";

/**
 * Proof-of-delivery records submitted from tmsmobile. No FK on doId — mirrors
 * TMS's own tms_pod_records table, which deliberately doesn't constrain it
 * (the delivery/loading data it references isn't necessarily WMS's own yet).
 */
export const PodRecordsTable = MainSchema.table('tms_pod_records', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  doId: uuid('do_id').notNull(),
  doNo: text('do_no').notNull(),
  outletName: text('outlet_name').notNull(),
  driverId: uuid('driver_id').references(() => DriversTable.id, { onDelete: 'set null' }),
  photoUrl: text('photo_url').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
  lat: numeric('lat', { precision: 10, scale: 7 }),
  lng: numeric('lng', { precision: 10, scale: 7 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type PodRecordType = typeof PodRecordsTable.$inferSelect;
export type PodRecordInsertType = typeof PodRecordsTable.$inferInsert;
