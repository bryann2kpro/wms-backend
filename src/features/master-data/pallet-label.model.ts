import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";
import { RacksTable } from "@/features/master-data/racks.model";

export const PalletLabelTable = MainSchema.table('m_pallet_labels', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),

  barCode: text('bar_code'),
  referenceNo: text('reference_no'),
  description: text('description'),
  storageBinId: uuid('storage_bin_id').references(() => RacksTable.rackId),
  labelCode: text('label_code').notNull(),
  printedCount: integer('printed_count').notNull().default(0),
  firstPrintedAt: timestamp('printed_at', { withTimezone: true }),
  lastPrintedAt: timestamp('last_printed_at', { withTimezone: true }),

  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type PalletLabelType = typeof PalletLabelTable.$inferSelect;
export type PalletLabelInsertType = typeof PalletLabelTable.$inferInsert;
