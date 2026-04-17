import { MainSchema } from '@/db/db.schema';
import { integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const WhatsAppNotificationStatusEnum = MainSchema.enum('whatsapp_notification_status', [
  'PENDING',
  'RETRYING',
  'SENT',
  'FAILED',
]);

export const WhatsAppNotificationsTable = MainSchema.table('whatsapp_notifications', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  triggerType: text('trigger_type').notNull(),
  referenceId: uuid('reference_id').notNull(),
  referenceLabel: text('reference_label'),
  toPhone: text('to_phone').notNull(),
  status: WhatsAppNotificationStatusEnum('status').notNull().default('PENDING'),
  attemptCount: integer('attempt_count').notNull().default(0),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  errorReason: text('error_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});

export const WhatsAppSettingsTable = MainSchema.table('whatsapp_settings', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  settingKey: text('setting_key').notNull().unique(),
  toPhones: text('to_phones').array().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type WhatsAppNotificationType = typeof WhatsAppNotificationsTable.$inferSelect;
export type WhatsAppNotificationInsertType = typeof WhatsAppNotificationsTable.$inferInsert;
export type WhatsAppSettingsType = typeof WhatsAppSettingsTable.$inferSelect;
