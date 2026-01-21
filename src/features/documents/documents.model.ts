import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";


/**
 * 
 * Proof / Documents (5MB per file enforced in app layer)
 * 
 * Documents that have been uploaded by the user as a proof of identity or other documents.
 * 
 * documentType:
 * - SUPPLIER_PROOF
 * - SIGNED_DO_PROOF
 * - EXCEPTION_PROOF
 * - INVOICE_EXPORT
 * 
 * referenceType:
 * - GRN
 * - DO
 * - EXCEPTION
 * - INVOICE
 * 
 */

export const DocumentsTable = MainSchema.table('documents', {
  documentId: uuid('document_id').defaultRandom().notNull().primaryKey(),
  documentName: text('document_name').notNull(),
  documentType: text('document_type').notNull(),
  referenceType: text('reference_type').notNull(),
  documentDescription: text('document_description').notNull(),
  documentUrl: text('document_url').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});