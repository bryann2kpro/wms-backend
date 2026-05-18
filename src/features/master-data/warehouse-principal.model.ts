import { MainSchema } from '@/db/db.schema';
import { uuid, timestamp, text } from 'drizzle-orm/pg-core';
import { WarehousesTable } from '@/features/master-data/warehouses.model';
import { OrganizationsTable } from '@/features/master-data/organization.model';

/**
 * Warehouse Principals Table
 *
 * @description Many-to-many join between warehouses and organizations.
 * One warehouse can hold goods for multiple principals (organizations).
 */
export const WarehousePrincipalsTable = MainSchema.table('warehouse_principals', {
  warehouseId:    uuid('warehouse_id').notNull().references(() => WarehousesTable.warehouseId),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
});

export type WarehousePrincipalType = typeof WarehousePrincipalsTable.$inferSelect;
export type WarehousePrincipalInsertType = typeof WarehousePrincipalsTable.$inferInsert;
