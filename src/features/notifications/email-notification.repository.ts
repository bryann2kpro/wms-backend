import { db } from '@/db';
import { logger } from '@/util/logger';
import { eq, and, inArray } from 'drizzle-orm';
import {
  EmailNotificationsTable,
  EmailNotificationType,
  EmailNotificationInsertType,
} from './email-notification.model';

export type CreateNotificationInput = Pick<
  EmailNotificationInsertType,
  'triggerType' | 'referenceId' | 'referenceLabel' | 'toEmail'
>;

export class EmailNotificationRepositoryClass {
  constructor() {}

  async createNotification(input: CreateNotificationInput): Promise<EmailNotificationType> {
    const [row] = await db
      .insert(EmailNotificationsTable)
      .values(input)
      .returning();
    logger.debug(`[EmailNotificationRepository.createNotification] Created notification id=${row.id}`);
    return row;
  }

  async findById(id: string): Promise<EmailNotificationType | null> {
    const [row] = await db
      .select()
      .from(EmailNotificationsTable)
      .where(eq(EmailNotificationsTable.id, id))
      .limit(1);
    return row ?? null;
  }

  /**
   * Returns an existing notification for the given reference that is not yet
   * in a terminal state. Used to prevent duplicate sends.
   */
  async findActiveForReference(
    referenceId: string,
    triggerType: string,
  ): Promise<EmailNotificationType | null> {
    const [row] = await db
      .select()
      .from(EmailNotificationsTable)
      .where(
        and(
          eq(EmailNotificationsTable.referenceId, referenceId),
          eq(EmailNotificationsTable.triggerType, triggerType),
          inArray(EmailNotificationsTable.status, ['PENDING', 'RETRYING', 'SENT']),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async markSent(id: string): Promise<void> {
    await db
      .update(EmailNotificationsTable)
      .set({ status: 'SENT', sentAt: new Date(), nextRetryAt: null })
      .where(eq(EmailNotificationsTable.id, id));
  }

  async markRetrying(
    id: string,
    nextRetryAt: Date,
    errorReason: string,
    attemptCount: number,
  ): Promise<void> {
    await db
      .update(EmailNotificationsTable)
      .set({
        status: 'RETRYING',
        nextRetryAt,
        errorReason,
        attemptCount,
        lastAttemptAt: new Date(),
      })
      .where(eq(EmailNotificationsTable.id, id));
  }

  async markFailed(id: string, errorReason: string, attemptCount: number): Promise<void> {
    await db
      .update(EmailNotificationsTable)
      .set({
        status: 'FAILED',
        errorReason,
        attemptCount,
        lastAttemptAt: new Date(),
        nextRetryAt: null,
      })
      .where(eq(EmailNotificationsTable.id, id));
  }
}
