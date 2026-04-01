import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";

/**
 * Stock Unit Table
 * 
 * @description This table is used to store the unit of measurement (UOM) for stock items.
 * Allows configuration of different stock units like Carton, Piece, Box, Pack, etc.
 * 
 * @field stockUnitId - Primary key
 * @field unitName - Display name of the unit (e.g., "Carton", "Piece", "Box")
 * @field unitCode - Unique short code for the unit (e.g., "CTN", "PCS", "BOX")
 * @field isActive - Whether this unit is currently active/available for selection
 */
export const StockUnitTable = MainSchema.table('m_stock_units', {
  stockUnitId: uuid('stock_unit_id').defaultRandom().notNull().primaryKey(),
  unitName: text('unit_name').notNull(),
  unitCode: text('unit_code').unique().notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type StockUnitType = typeof StockUnitTable.$inferSelect;
export type StockUnitInsertType = typeof StockUnitTable.$inferInsert;

/**
 * Stock Unit Codes
 * @description Default stock unit codes in the system
 */
export const StockUnitCode = {
  CARTON: 'CTN',
  PIECE: 'PCS',
  BOX: 'BOX',
  PACK: 'PCK',
  UNIT: 'UNIT',
  PACKET: 'PKT',
} as const;

export type StockUnitCodeType = typeof StockUnitCode[keyof typeof StockUnitCode];
