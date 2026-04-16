import { db } from '@/db';
import { and, eq, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';
import {
  WhatsAppNotificationInsertType,
  WhatsAppNotificationsTable,
  WhatsAppNotificationType,
  WhatsAppSettingsTable,
  WhatsAppSettingsType,
} from './whatsapp.model';

export type CreateWhatsAppNotificationInput = Pick<
  WhatsAppNotificationInsertType,
  'triggerType' | 'referenceId' | 'referenceLabel' | 'toPhone'
>;

export class WhatsAppNotificationRepositoryClass {
  async createNotification(input: CreateWhatsAppNotificationInput): Promise<WhatsAppNotificationType> {
    const [row] = await db
      .insert(WhatsAppNotificationsTable)
      .values(input)
      .returning();
    logger.debug(`[WhatsAppNotificationRepository.createNotification] Created notification id=${row.id}`);
    return row;
  }

  async findById(id: string): Promise<WhatsAppNotificationType | null> {
    const [row] = await db
      .select()
      .from(WhatsAppNotificationsTable)
      .where(eq(WhatsAppNotificationsTable.id, id))
      .limit(1);
    return row ?? null;
  }

  async findActiveForReference(
    referenceId: string,
    triggerType: string,
    toPhone: string,
  ): Promise<WhatsAppNotificationType | null> {
    const [row] = await db
      .select()
      .from(WhatsAppNotificationsTable)
      .where(
        and(
          eq(WhatsAppNotificationsTable.referenceId, referenceId),
          eq(WhatsAppNotificationsTable.triggerType, triggerType),
          eq(WhatsAppNotificationsTable.toPhone, toPhone),
          inArray(WhatsAppNotificationsTable.status, ['PENDING', 'RETRYING', 'SENT']),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async markSent(id: string): Promise<void> {
    await db
      .update(WhatsAppNotificationsTable)
      .set({ status: 'SENT', sentAt: new Date(), nextRetryAt: null })
      .where(eq(WhatsAppNotificationsTable.id, id));
  }

  async markRetrying(
    id: string,
    nextRetryAt: Date,
    errorReason: string,
    attemptCount: number,
  ): Promise<void> {
    await db
      .update(WhatsAppNotificationsTable)
      .set({
        status: 'RETRYING',
        nextRetryAt,
        errorReason,
        attemptCount,
        lastAttemptAt: new Date(),
      })
      .where(eq(WhatsAppNotificationsTable.id, id));
  }

  async markFailed(id: string, errorReason: string, attemptCount: number): Promise<void> {
    await db
      .update(WhatsAppNotificationsTable)
      .set({
        status: 'FAILED',
        errorReason,
        attemptCount,
        lastAttemptAt: new Date(),
        nextRetryAt: null,
      })
      .where(eq(WhatsAppNotificationsTable.id, id));
  }
}

export class WhatsAppSettingsRepositoryClass {
  async getByKey(settingKey: string): Promise<WhatsAppSettingsType | null> {
    const [row] = await db
      .select()
      .from(WhatsAppSettingsTable)
      .where(eq(WhatsAppSettingsTable.settingKey, settingKey))
      .limit(1);
    return row ?? null;
  }

  async upsert(settingKey: string, toPhones: string[]): Promise<WhatsAppSettingsType> {
    const [row] = await db
      .insert(WhatsAppSettingsTable)
      .values({ settingKey, toPhones, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: WhatsAppSettingsTable.settingKey,
        set: { toPhones, updatedAt: new Date() },
      })
      .returning();
    logger.debug(`[WhatsAppSettingsRepository.upsert] Upserted settings for key="${settingKey}"`);
    return row;
  }
}

