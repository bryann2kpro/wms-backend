import { MainSchema } from '@/db/db.schema';
import { uuid, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Countries Table
 *
 * @description System-wide shared geography. Not scoped to any organization.
 * Used as the top of the Country → Region → Warehouse hierarchy.
 *
 * @field countryId   - Primary key
 * @field countryName - Full name, e.g. "Malaysia"
 * @field countryCode - ISO 3166-1 alpha-2, e.g. "MY"
 */
export const CountriesTable = MainSchema.table('m_countries', {
  countryId:   uuid('country_id').defaultRandom().notNull().primaryKey(),
  countryName: text('country_name').notNull(),
  countryCode: text('country_code').unique().notNull(),
  currency:    text('currency'),
  locale:      text('locale'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export type CountryType = typeof CountriesTable.$inferSelect;
export type CountryInsertType = typeof CountriesTable.$inferInsert;
