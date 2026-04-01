import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { OrganizationsTable } from "./organization.model";

/**
* Suppliers Table
* Description: This table is used to store the Empire Sushi's suppliers data.
*/
export const SuppliersTable = MainSchema.table('m_suppliers', {
  supplierId: uuid('supplier_id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  supplierName: text('supplier_name').notNull(),
  supplierCode: text('supplier_code').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});