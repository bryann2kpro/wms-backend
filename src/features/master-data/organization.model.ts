import { MainSchema } from "@/db/db.schema";
import { uuid, text, varchar, timestamp } from "drizzle-orm/pg-core";

/**
 * Organizations Table (Master Data)
 *
 * @description Stores organization/tenant master data for multi-tenant WMS.
 * Each organization is an independent tenant with isolated data.
 *
 * @field organizationId - Primary key
 * @field organizationName - Display name of the organization
 * @field organizationCode - Unique code for the organization
 * @field status - Organization status (active, inactive)
 */
export const OrganizationsTable = MainSchema.table("m_organizations", {
  organizationId: uuid("organization_id").defaultRandom().notNull().primaryKey(),
  organizationName: text("organization_name").notNull(),
  organizationCode: text("organization_code").unique().notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export type OrganizationType = typeof OrganizationsTable.$inferSelect;
export type OrganizationInsertType = typeof OrganizationsTable.$inferInsert;
