import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { StockUnitTable } from "./stock-unit.model";

/**
* Sku Table
* Description: This table is used to store the Empire Sushi's sku data.
*/

export const SkuTable = MainSchema.table('skus', {
  skuId: uuid('sku_id').defaultRandom().notNull().primaryKey(),
  skuCode: text('sku_code').notNull(),
  skuDescription: text('sku_description').notNull(),
  skuPrice: numeric('sku_price', { precision: 6, scale: 2 }),
  cartonQuantity: numeric('carton_quantity', { precision: 6, scale: 2 }).notNull().default('0'),
  lossQuantity: numeric('loss_quantity', { precision: 6, scale: 2 }).notNull().default('0'),

  skuExpiryDate: timestamp('sku_expiry_date', { withTimezone: true }),
  /**
   * SKU Suppliers - Array of supplier references with original SKU codes
   * @field supplierId - References SuppliersTable.supplierId (foreign key relationship)
   * @field originalSkuCode - Original SKU code from supplier (nullable)
   */
  skuSuppliers: jsonb('sku_suppliers').$type<Array<{ supplierId: string; originalSkuCode: string | null }>>(),
  /**
   * Optional per-expiry / per-rack batch details for this SKU.
   * Mirrors the GRN item structure: one entry per expiry date with associated rack IDs.
   */
  skuBatches: jsonb('sku_batches').$type<Array<{ expiryDate: string | null; rackIds: string[] }>>(),
  skuUom: uuid('sku_unit_of_measurement').notNull().references(() => StockUnitTable.stockUnitId),
  isActive: boolean('is_active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type SkuType = typeof SkuTable.$inferSelect;
export type SkuInsertType = Omit<
  typeof SkuTable.$inferInsert,
  'isActive' | 'createdBy' | 'updatedBy'
>;
