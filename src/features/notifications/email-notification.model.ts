import { MainSchema } from '@/db/db.schema';
import { uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const EmailNotificationStatusEnum = MainSchema.enum('email_notification_status', [
  'PENDING',
  'RETRYING',
  'SENT',
  'FAILED',
]);

/**
 * Email Notifications Table
 *
 * @description Tracks outbound admin email notifications and their delivery status.
 * Generic by design — triggerType identifies the source event (e.g. 'ADVANCE_NOTICE_RECEIVED').
 * referenceId is a soft FK to the source record (no hard constraint).
 *
 * @field triggerType    - Event that caused this notification (e.g. 'ADVANCE_NOTICE_RECEIVED')
 * @field referenceId    - Soft FK to the source record
 * @field referenceLabel - Human-readable label stored at creation time (e.g. tranid 'PO-12345')
 * @field status         - Delivery status: PENDING → SENT or RETRYING → FAILED
 * @field attemptCount   - Number of send attempts made (source of truth for retry logic)
 * @field errorReason    - Last SMTP error message (truncated if needed)
 * @field nextRetryAt    - When the retry job should pick this up (NULL when SENT or FAILED)
 * @field sentAt         - Set when status transitions to SENT
 */
export const EmailNotificationsTable = MainSchema.table('email_notifications', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),

  triggerType: text('trigger_type').notNull(),
  referenceId: uuid('reference_id').notNull(),
  referenceLabel: text('reference_label'),

  toEmail: text('to_email').notNull(),

  status: EmailNotificationStatusEnum('status').notNull().default('PENDING'),
  attemptCount: integer('attempt_count').notNull().default(0),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  errorReason: text('error_reason'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});

export type EmailNotificationType = typeof EmailNotificationsTable.$inferSelect;
export type EmailNotificationInsertType = typeof EmailNotificationsTable.$inferInsert;
