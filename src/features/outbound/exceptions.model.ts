import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";

/**
 * Exceptions Table
 * 
 * @description Tracks shortage and damage exceptions during delivery.
 * Store keepers report exceptions, and Supervisors/Admins approve or reject them.
 * 
 * @field doId - Reference to the Delivery Order with the exception
 * @field skuId - Reference to the SKU affected
 * @field qty - Quantity affected by the exception
 * @field reportedBy - User who reported the exception (typically Store Keeper)
 * @field decidedBy - User who approved/rejected the exception (Supervisor/Admin)
 * @field decisionReason - Reason for the approval/rejection decision
 * 
 * @type
 * - SHORTAGE: Goods missing or short
 * - DAMAGE: Goods damaged during delivery
 * 
 * @status
 * - REPORTED: Exception reported, pending decision
 * - APPROVED: Exception approved
 * - REJECTED: Exception rejected
 */
export const ExceptionsTable = MainSchema.table('exceptions', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  doId: uuid('do_id').notNull(),
  skuId: uuid('sku_id').notNull(),

  type: text('type').notNull(),
  qty: numeric('qty', { precision: 10, scale: 2 }).notNull(),

  status: text('status').notNull().default('REPORTED'),
  reportedBy: uuid('reported_by').notNull(),
  reportedAt: timestamp('reported_at').defaultNow().notNull(),

  decidedBy: uuid('decided_by'),
  decidedAt: timestamp('decided_at'),
  decisionReason: text('decision_reason'),
  notes: text('notes'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ExceptionType = typeof ExceptionsTable.$inferSelect;
export type ExceptionInsertType = typeof ExceptionsTable.$inferInsert;
export type ExceptionFilter = {
  id?: string | string[];
  doId?: string | string[];
  skuId?: string | string[];
  type?: string | string[];
  status?: string | string[];
  reportedBy?: string | string[];
  reportedAtFrom?: string;
  reportedAtTo?: string;
};
