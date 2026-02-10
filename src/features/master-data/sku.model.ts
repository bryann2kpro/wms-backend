import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { SuppliersTable } from "./suppliers.model";

/**
* Sku Table
* Description: This table is used to store the Empire Sushi's sku data.
*/

export const SkuTable = MainSchema.table('skus', {
  skuId: uuid('sku_id').defaultRandom().notNull().primaryKey(),
  skuCode: text('sku_code').notNull(),
  skuDescription: text('sku_description').notNull(),
  skuPrice: numeric('sku_price').notNull(),
  skuQuantity: numeric('sku_quantity', { precision: 4 }).notNull(),
  skuExpiryDate: timestamp('sku_expiry_date').notNull(),
  skuSuppliers: uuid('sku_suppliers').array().notNull().references(() => SuppliersTable.supplierId),
  skuUom: text('sku_unit_of_measurement').notNull(),
  isActive: boolean('is_active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

