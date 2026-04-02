import { MainSchema } from '@/db/db.schema';
import { uuid, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Email Notification Settings Table
 *
 * @description Stores per-trigger-type email recipient configuration.
 * Each row is keyed by triggerType (e.g. 'ADVANCE_NOTICE_RECEIVED').
 *
 * @field settingKey - Matches trigger type (e.g. 'ADVANCE_NOTICE_RECEIVED')
 * @field toEmails   - Primary recipients list
 * @field ccEmails   - CC recipients list
 */
export const EmailNotificationSettingsTable = MainSchema.table('email_settings', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  settingKey: text('setting_key').notNull().unique(),
  toEmails: text('to_emails').array().notNull().default([]),
  ccEmails: text('cc_emails').array().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type EmailNotificationSettingsType = typeof EmailNotificationSettingsTable.$inferSelect;
