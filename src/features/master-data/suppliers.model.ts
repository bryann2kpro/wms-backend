import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";

/**
* Suppliers Table
* Description: This table is used to store the Empire Sushi's suppliers data.
*/
export const SuppliersTable = MainSchema.table('supplers', {
  supplierId: uuid('supplier_id').defaultRandom().notNull().primaryKey(),
  supplierName: text('supplier_name').notNull(),
  supplierCode: text('supplier_code').unique().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});