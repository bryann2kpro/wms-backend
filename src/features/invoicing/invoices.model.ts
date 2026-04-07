import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "@/features/master-data/organization.model";

/**
 * Invoices Table
 * 
 * @description Invoices issued by SME (WMS) to ES upon delivery.
 * Each invoice is linked to a Delivery Order and contains billing details.
 * 
 * @field invoiceNo - Unique invoice number
 * @field doId - Reference to the Delivery Order (one-to-one)
 * @field toId - Reference to the Transfer Order for cross-reference
 * @field poNo - Purchase Order number for cross-reference
 * @field billingAddressId - Address snapshot for billing
 * @field deliveryAddressId - Address snapshot for delivery
 * @field customerAccount - Customer account code
 * @field salesExecutive - Name of sales executive handling the account
 * @field pageNo - Page number for multi-page invoices
 * @field dateIssued - Date the invoice was issued
 * 
 * @status
 * - DRAFT: Invoice created but not finalized
 * - ISSUED: Invoice finalized and issued
 * - SENT: Invoice sent to customer
 * - CANCELLED: Invoice cancelled
 */
export const InvoicesTable = MainSchema.table('invoices', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  invoiceNo: text('invoice_no').unique().notNull(),

  doId: uuid('do_id').unique().notNull(),
  poId: uuid('po_id'),
  poNo: text('po_no'),
  doNo: text('do_no'),

  billingAddressId: uuid('billing_address_id'),
  deliveryAddressId: uuid('delivery_address_id'),

  customerAccount: text('customer_account'),
  salesExecutive: text('sales_executive'),
  pageNo: text('page_no'),
  dateIssued: timestamp('date_issued'),

  totalExclTax: numeric('total_excl_tax', { precision: 12, scale: 2 }),
  taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }),
  totalInclTax: numeric('total_incl_tax', { precision: 12, scale: 2 }),
  taxRate: numeric('tax_rate', { precision: 5, scale: 2 }),

  status: text('status').notNull().default('DRAFT'),
  issuedBy: uuid('issued_by'),
  issuedAt: timestamp('issued_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: uuid('created_by').notNull(),
  updatedBy: uuid('updated_by'),
});

/**
 * Invoice Items Table
 * 
 * @description Line items for each invoice.
 * Each record represents a specific SKU billed on the invoice.
 * 
 * @field invoiceId - Reference to the parent invoice
 * @field itemNo - Line item number on the invoice
 * @field skuId - Reference to the SKU
 * @field description - Item description (may differ from SKU description)
 * @field qty - Quantity billed
 * @field unitPrice - Price per unit
 * @field subTotal - Line total (qty * unitPrice)
 */
export const InvoiceItemsTable = MainSchema.table('invoice_items', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  invoiceId: uuid('invoice_id').notNull(),
  itemNo: text('item_no'),
  skuId: uuid('sku_id').notNull(),
  description: text('description'),
  qty: numeric('qty', { precision: 10, scale: 2 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  subTotal: numeric('sub_total', { precision: 12, scale: 2 }).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: uuid('created_by').notNull(),
  updatedBy: uuid('updated_by'),
});

/**
 * Invoice Exports Table
 * 
 * @description Tracks exported versions of invoices in various formats.
 * Each record represents a single export of an invoice.
 * 
 * @field invoiceId - Reference to the invoice exported
 * @field format - Export format (PDF, XLSX, TXT)
 * @field storageKey - Key/path in storage system
 * @field url - Public URL to access the export
 */
export const InvoiceExportsTable = MainSchema.table('invoice_exports', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  invoiceId: uuid('invoice_id').notNull(),
  format: text('format').notNull(),
  storageKey: text('storage_key').notNull(),
  url: text('url'),

  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type InvoiceType = typeof InvoicesTable.$inferSelect;
export type InvoiceInsertType = typeof InvoicesTable.$inferInsert;
export type InvoiceFilter = {
  id?: string | string[];
  invoiceNo?: string;
  doId?: string | string[];
  poId?: string | string[];
  status?: string | string[];
  search?: string;
  dateIssuedFrom?: string;
  dateIssuedTo?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  deliveryDateFrom?: string;
  deliveryDateTo?: string;
};

export type InvoiceSummaryData = {
  issued: number;
  sent: number;
  cancelled: number;
  totalAmount: string;
};

export type InvoiceWithDoNo = InvoiceType & {
  doNo?: string | null;
  poAmount?: string | null;
  poAmountCalcSnapshot?: Record<string, unknown> | null;
};

export type InvoiceItemType = typeof InvoiceItemsTable.$inferSelect;
export type InvoiceItemInsertType = typeof InvoiceItemsTable.$inferInsert;
export type InvoiceItemFilter = {
  id?: string | string[];
  invoiceId?: string | string[];
  skuId?: string | string[];
};
