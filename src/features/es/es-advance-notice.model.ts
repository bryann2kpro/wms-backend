import { jsonb, timestamp, uuid } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { ApiKeysTable } from '@/features/api-keys/api-keys.model';

/**
 * ES Advance Notices Table
 *
 * @description Stores raw advance notice payloads received from Empire Sushi.
 * No processing is done on the payload — it is stored as-is for record keeping.
 *
 * @field apiKeyId   - The API key used to submit this notice (for audit)
 * @field payload    - Raw JSON body from Empire Sushi (stored as JSONB)
 * @field receivedAt - Timestamp when the notice was received
 */
export const EsAdvanceNoticesTable = MainSchema.table('es_advance_notices', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  apiKeyId: uuid('api_key_id').references(() => ApiKeysTable.id),
  payload: jsonb('payload').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
});

export type EsAdvanceNoticeType = typeof EsAdvanceNoticesTable.$inferSelect;
export type EsAdvanceNoticeInsertType = typeof EsAdvanceNoticesTable.$inferInsert;
