import { MainSchema } from "@/db/db.schema";
import { uuid, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Documents Table
 * 
 * @description Proof documents and file uploads (5MB per file enforced in app layer).
 * Used for storing delivery proofs, signed documents, exception evidence, and invoice exports.
 * 
 * @field docType - Type of document
 * @field refType - Type of entity this document is attached to
 * @field refId - ID of the entity this document is attached to
 * @field fileName - Original file name
 * @field fileSizeBytes - File size in bytes
 * @field mimeType - MIME type of the file
 * @field storageKey - Key/path in storage system
 * @field url - Public URL to access the document
 * @field checksum - File checksum for integrity verification
 * 
 * @docType Document types:
 * - SUPPLIER_PROOF: Proof from supplier delivery
 * - SIGNED_DO_PROOF: Signed Delivery Order proof
 * - EXCEPTION_PROOF: Evidence for shortage/damage exceptions
 * - INVOICE_EXPORT: Exported invoice document
 * 
 * @refType Reference types:
 * - GRN: Goods Received Note
 * - DO: Delivery Order
 * - EXCEPTION: Exception record
 * - INVOICE: Invoice
 */
export const DocumentsTable = MainSchema.table('documents', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  docType: text('doc_type').notNull(),
  refType: text('ref_type').notNull(),
  refId: uuid('ref_id').notNull(),

  fileName: text('file_name').notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull(),
  mimeType: text('mime_type').notNull(),
  storageKey: text('storage_key').notNull(),
  url: text('url'),
  checksum: text('checksum'),

  uploadedBy: uuid('uploaded_by').notNull(),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
});