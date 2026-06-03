import { jsonb, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { ApiKeysTable } from '@/features/api-keys/api-keys.model';

/**
 * ES Advance Notices Table
 *
 * @description Stores advance notice payloads received from NetSuite (via Empire Sushi).
 * tranid is stored as a unique column to prevent duplicate submissions.
 *
 * @field tranid     - NetSuite PO number (unique — used for duplicate detection)
 * @field apiKeyId   - The API key used to submit this notice (for audit)
 * @field payload    - Raw JSON body stored as JSONB
 * @field receivedAt - Timestamp when the notice was received
 */
export const EsAdvanceNoticesTable = MainSchema.table('es_advance_notices', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  tranid: varchar('tranid', { length: 50 }).notNull().unique(),
  apiKeyId: uuid('api_key_id').references(() => ApiKeysTable.id),
  payload: jsonb('payload').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  /**
   * Set when this advance notice has been used to create a GRN.
   * No FK constraint to avoid circular reference with grns table.
   * NULL = pending (not yet linked to a GRN).
   */
  linkedGrnId: uuid('linked_grn_id'),
});

export const EsItemReceiptsTable = MainSchema.table('es_item_receipts', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  poNumber: varchar('po_number', { length: 50 }),
  esAdvanceNoticeId: uuid('es_advance_notice_id').references(() => EsAdvanceNoticesTable.id),
  payload: jsonb('payload').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
  nsResponse: jsonb('ns_response'),
});

export type EsAdvanceNoticeType = typeof EsAdvanceNoticesTable.$inferSelect;
export type EsAdvanceNoticeInsertType = typeof EsAdvanceNoticesTable.$inferInsert;

/**
 * ES Advance Notice Log Table
 *
 * @description Records every inbound advance notice request — success, validation errors,
 * duplicates, and unexpected failures. Enables full audit visibility on the API Log page.
 *
 * @field status  - "success" | "validation_error" | "duplicate" | "error"
 * @field advanceNoticeId - set only when status = "success", links to es_advance_notices
 */
export const EsAdvanceNoticeLogTable = MainSchema.table('es_advance_notice_log', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  apiKeyId: uuid('api_key_id').references(() => ApiKeysTable.id),
  rawPayload: jsonb('raw_payload').notNull(),
  status: varchar('status', { length: 30 }).notNull(),
  errorMessage: text('error_message'),
  advanceNoticeId: uuid('advance_notice_id'),
});

export type EsAdvanceNoticeLogType = typeof EsAdvanceNoticeLogTable.$inferSelect;
export type EsAdvanceNoticeLogInsertType = typeof EsAdvanceNoticeLogTable.$inferInsert;
