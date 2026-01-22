import { MainSchema } from "@/db/db.schema";
import { uuid, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";

/**
* Outlets Table
* Description: This table is used to store the Empire Sushi's outlets data.
*/
export const OutletsTable = MainSchema.table('outlets', {
  outletId: uuid('outlet_id').defaultRandom().notNull().primaryKey(),
  outletName: text('outlet_name').notNull(),
  outletCode: text('outlet_code').unique().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});