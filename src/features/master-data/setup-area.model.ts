import { MainSchema } from '@/db/db.schema';
import { uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { OrganizationsTable } from '@/features/master-data/organization.model';

/**
 * Setup Area Table
 *
 * @description Simple master-data lookup for WMS Setup > Area (code + description).
 * Separate from warehouse floor areas in m_warehouse_areas.
 *
 * @field id - Primary key
 * @field organizationId - FK to organizations (multi-tenant)
 * @field code - Short area code (e.g. AMP, BA, BAS)
 * @field description - Display description of the area
 */
export const SetupAreaTable = MainSchema.table('m_area', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  code: text('code').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type SetupAreaType = typeof SetupAreaTable.$inferSelect;
export type SetupAreaInsertType = typeof SetupAreaTable.$inferInsert;
