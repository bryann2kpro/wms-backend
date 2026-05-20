import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";
import { RacksTable } from "@/features/master-data/racks.model";

export const TransportTable = MainSchema.table('m_transports', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  code: text('code').notNull(),
  description: text('description'),
  storageBinId: uuid('storage_bin_id').references(() => RacksTable.rackId),
  location: text('location'),
  minLengthMm: numeric('min_length_mm', { precision: 10, scale: 2 }),
  minWidthMm: numeric('min_width_mm', { precision: 10, scale: 2 }),
  minHeightMm: numeric('min_height_mm', { precision: 10, scale: 2 }),
  minWeightKg: numeric('min_weight_kg', { precision: 10, scale: 3 }),
  maxLengthMm: numeric('max_length_mm', { precision: 10, scale: 2 }),
  maxWidthMm: numeric('max_width_mm', { precision: 10, scale: 2 }),
  maxHeightMm: numeric('max_height_mm', { precision: 10, scale: 2 }),
  maxWeightKg: numeric('max_weight_kg', { precision: 10, scale: 3 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type TransportType = typeof TransportTable.$inferSelect;
export type TransportInsertType = typeof TransportTable.$inferInsert;
