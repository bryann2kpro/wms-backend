import { boolean, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { UsersTable } from '@/features/auth/auth.model';
import { OrganizationsTable } from '@/features/master-data/organization.model';

/**
 * API Keys Table
 *
 * @description Stores API keys for third-party integrations.
 * The raw key is never stored — only a SHA-256 hash.
 * The first 8 characters (keyPrefix) are stored for identification in the UI.
 *
 * @field name         - Human-readable label (e.g. "Empire Sushi Integration")
 * @field keyHash      - SHA-256 hex digest of the raw key (used for lookup)
 * @field keyPrefix    - First 8 chars of the raw key (shown in UI, not secret)
 * @field organizationId - Owning organization (optional for now)
 * @field isActive     - Whether the key is currently valid
 * @field expiresAt    - Optional expiry; null means never expires
 * @field lastUsedAt   - Stamped on every successful authentication
 */
export const ApiKeysTable = MainSchema.table('api_keys', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  keyHash: varchar('key_hash', { length: 64 }).notNull().unique(),
  keyPrefix: varchar('key_prefix', { length: 8 }).notNull(),
  organizationId: uuid('organization_id').references(() => OrganizationsTable.organizationId),
  isActive: boolean('is_active').notNull().default(true),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => UsersTable.id),
});

export type ApiKeyType = typeof ApiKeysTable.$inferSelect;
export type ApiKeyInsertType = typeof ApiKeysTable.$inferInsert;
