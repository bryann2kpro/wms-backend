import { db } from '@/db';
import { logger } from '@/util/logger';
import { eq } from 'drizzle-orm';
import { EmailNotificationSettingsTable, EmailNotificationSettingsType } from './email-settings.model';

export const ADVANCE_NOTICE_SETTING_KEY = 'ADVANCE_NOTICE_RECEIVED';

export class EmailSettingsRepositoryClass {
  async getByKey(settingKey: string): Promise<EmailNotificationSettingsType | null> {
    const [row] = await db
      .select()
      .from(EmailNotificationSettingsTable)
      .where(eq(EmailNotificationSettingsTable.settingKey, settingKey))
      .limit(1);
    return row ?? null;
  }

  async upsert(
    settingKey: string,
    toEmails: string[],
    ccEmails: string[],
  ): Promise<EmailNotificationSettingsType> {
    const [row] = await db
      .insert(EmailNotificationSettingsTable)
      .values({ settingKey, toEmails, ccEmails, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: EmailNotificationSettingsTable.settingKey,
        set: { toEmails, ccEmails, updatedAt: new Date() },
      })
      .returning();
    logger.debug(`[EmailSettingsRepository.upsert] Upserted settings for key="${settingKey}"`);
    return row;
  }
}
