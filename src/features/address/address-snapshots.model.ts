import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Address Snapshots Table
 * 
 * @description Immutable address records used for document headers.
 * Once created, these snapshots are not modified - they preserve the exact
 * address information at the time of document creation for audit purposes.
 * 
 * Used by:
 * - Supplier Deliveries (invoice_to, deliver_to addresses)
 * - Invoices (billing, delivery addresses)
 * 
 * @field companyName - Name of the company
 * @field attnName - Attention/contact person name
 * @field tel - Telephone number
 * @field fax - Fax number
 * @field addressText - Full address text
 */
export const AddressSnapshotsTable = MainSchema.table('address_snapshots', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  companyName: text('company_name').notNull(),
  attnName: text('attn_name'),
  tel: text('tel'),
  fax: text('fax'),
  addressText: text('address_text').notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: uuid('created_by').notNull(),
});
