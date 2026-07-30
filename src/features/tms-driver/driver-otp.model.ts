import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp, integer } from "drizzle-orm/pg-core";
import { DriversTable } from "./drivers.model";

/**
 * WhatsApp OTP login codes for tmsmobile drivers. A code is hashed (never
 * stored plaintext) and single-use — consumedAt is set once verifyDriverOtp
 * succeeds, so a stale code can't be replayed even before it expires.
 */
export const DriverOtpCodesTable = MainSchema.table('driver_otp_codes', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  driverId: uuid('driver_id').notNull().references(() => DriversTable.id, { onDelete: 'cascade' }),
  phone: text('phone').notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type DriverOtpCodeType = typeof DriverOtpCodesTable.$inferSelect;
export type DriverOtpCodeInsertType = typeof DriverOtpCodesTable.$inferInsert;
