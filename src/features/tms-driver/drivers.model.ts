import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp, numeric, varchar } from "drizzle-orm/pg-core";

/**
 * Driver roster synced from TMS. No organizationId — mirrors TMS's own schema,
 * which has no multi-tenant scoping for drivers.
 */
export const DriversTable = MainSchema.table('drivers', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  // Nullable — WhatsApp self-registration only captures name+phone; an admin fills these in later.
  licenseNumber: text('license_number'),
  licenseExpiry: text('license_expiry'),
  status: text('status').default('ACTIVE').notNull(),
  plateNumber: text('plate_number'),
  vehicleType: text('vehicle_type'),
  fleetCategory: text('fleet_category'),
  barcode: text('barcode'),
  clockedInAt: timestamp('clocked_in_at', { withTimezone: true }),
  email: varchar('email', { length: 100 }),
  passwordHash: varchar('password_hash', { length: 255 }),
  btm: numeric('btm', { precision: 12, scale: 2 }),
  bdm: numeric('bdm', { precision: 12, scale: 2 }),
  payload: numeric('payload', { precision: 12, scale: 2 }),
  length: text('length'),
  width: text('width'),
  height: text('height'),
  pallet4x3: numeric('pallet_4x3', { precision: 6, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type DriverType = typeof DriversTable.$inferSelect;
export type DriverInsertType = typeof DriversTable.$inferInsert;
