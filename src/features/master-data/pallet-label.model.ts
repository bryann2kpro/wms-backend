import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";
import { RacksTable } from "@/features/master-data/racks.model";

export const PalletLabelTable = MainSchema.table('m_pallet_labels', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),

  barCode: text('bar_code'),
  referenceNo: text('reference_no'),
  itemCode: text('item_code').notNull(),
  description: text('description'),
  itemDesc02: text('item_desc_02'),
  storageBinId: uuid('storage_bin_id').references(() => RacksTable.rackId),
  labelCode: text('label_code').notNull(),
  printedCount: integer('printed_count').notNull().default(0),
  firstPrintedAt: timestamp('printed_at', { withTimezone: true }),
  lastPrintedAt: timestamp('last_printed_at', { withTimezone: true }),

  isActive: boolean('is_active').notNull().default(true),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type PalletLabelType = typeof PalletLabelTable.$inferSelect;
export type PalletLabelInsertType = typeof PalletLabelTable.$inferInsert;
