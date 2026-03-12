import { MainSchema } from "@/db/db.schema";
import { uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";

/**
 * Settlements Table
 * 
 * @description Admin checklist for settling/closing a Delivery Order.
 * Tracks completion of all required steps before a delivery can be considered fully settled.
 * 
 * @field doId - Reference to the Delivery Order (one-to-one)
 * @field deliveredConfirmed - Whether delivery has been confirmed
 * @field signedProofUploaded - Whether signed proof of delivery has been uploaded
 * @field exceptionsResolved - Whether all exceptions have been resolved
 * @field netsuiteUpdated - Whether NetSuite has been updated with delivery status
 * @field invoiceIssued - Whether the invoice has been issued
 * @field settledBy - User who marked the settlement as complete
 * @field settledAt - Timestamp when settlement was completed
 * 
 * @status
 * - OPEN: Settlement in progress, checklist items pending
 * - SETTLED: All checklist items complete, delivery fully settled
 */
export const SettlementsTable = MainSchema.table('settlements', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  doId: uuid('do_id').unique().notNull(),

  status: text('status').notNull().default('OPEN'),

  deliveredConfirmed: boolean('delivered_confirmed').notNull().default(false),
  signedProofUploaded: boolean('signed_proof_uploaded').notNull().default(false),
  exceptionsResolved: boolean('exceptions_resolved').notNull().default(false),
  netsuiteUpdated: boolean('netsuite_updated').notNull().default(false),
  invoiceIssued: boolean('invoice_issued').notNull().default(false),

  settledBy: uuid('settled_by'),
  settledAt: timestamp('settled_at'),
  notes: text('notes'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});
