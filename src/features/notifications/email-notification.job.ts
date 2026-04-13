import { Queue, Worker, type Job } from 'bullmq';
import { getBullConnection } from '@/jobs/bullmq-connection';
import { logger } from '@/util/logger';
import { emailNotificationRepository, emailSettingsRepository } from '@/composition-root';
import { EsAdvanceNoticesTable } from '@/features/es/es.model';
import { db } from '@/db';
import { eq } from 'drizzle-orm';
import { sendAdvanceNoticeEmail } from '@/util/mailer';
import { ADVANCE_NOTICE_SETTING_KEY } from './email-settings.repository';

const EMAIL_QUEUE_NAME = 'email-notifications';
const EMAIL_JOB_NAME = 'send-email-notification';
const MAX_ATTEMPTS = 3;
// Delay (ms) before each retry attempt index. Index 0 = first attempt (no delay).
const RETRY_DELAYS_MS = [0, 5 * 60 * 1000, 30 * 60 * 1000];

type EmailJobPayload = { notificationId: string };

/**
 * Core handler: fetches the notification row, resolves the email content from
 * the linked advance notice, sends the email, and updates the row status.
 */
async function processEmailNotification(notificationId: string): Promise<void> {
  const notification = await emailNotificationRepository.findById(notificationId);

  if (!notification) {
    logger.warn(`⚠️ [EmailJob] Notification not found: ${notificationId}`);
    return;
  }

  // Idempotency guard — skip if already delivered
  if (notification.status === 'SENT') {
    logger.info(`ℹ️ [EmailJob] Notification ${notificationId} already sent, skipping`);
    return;
  }

  const attemptNumber = notification.attemptCount + 1;

  try {
    // Fetch the linked advance notice to get email content
    const [advanceNotice] = await db
      .select()
      .from(EsAdvanceNoticesTable)
      .where(eq(EsAdvanceNoticesTable.id, notification.referenceId))
      .limit(1);

    if (!advanceNotice) {
      logger.warn(`⚠️ [EmailJob] Linked advance notice not found for notificationId=${notificationId}, referenceId=${notification.referenceId}`);
      await emailNotificationRepository.markFailed(notificationId, 'Linked advance notice record not found', attemptNumber);
      return;
    }

    const payload = advanceNotice.payload as {
      entity: string;
      duedate: string;
      lines: unknown[];
    };

    const emailSettings = await emailSettingsRepository.getByKey(ADVANCE_NOTICE_SETTING_KEY);
    const toEmails = emailSettings?.toEmails?.length ? emailSettings.toEmails : [notification.toEmail];
    const ccEmails = emailSettings?.ccEmails?.length ? emailSettings.ccEmails : undefined;

    await sendAdvanceNoticeEmail(
      toEmails,
      {
        tranid: advanceNotice.tranid,
        duedate: payload.duedate,
        entity: payload.entity,
        lineCount: Array.isArray(payload.lines) ? payload.lines.length : 0,
        receivedAt: advanceNotice.receivedAt,
      },
      ccEmails,
    );

    await emailNotificationRepository.markSent(notificationId);
    logger.info(`✅ [EmailJob] Notification sent — id=${notificationId}, tranid=${advanceNotice.tranid}`);
  } catch (error) {
    const errorReason = error instanceof Error ? error.message : String(error);
    logger.error(`❌ [EmailJob] Send attempt ${attemptNumber} failed for notificationId=${notificationId}:`, error);

    if (attemptNumber >= MAX_ATTEMPTS) {
      await emailNotificationRepository.markFailed(notificationId, errorReason, attemptNumber);
      logger.error(`❌ [EmailJob] Max attempts (${MAX_ATTEMPTS}) reached — notificationId=${notificationId} marked FAILED`);
      return;
    }

    const nextDelay = RETRY_DELAYS_MS[attemptNumber] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
    const nextRetryAt = new Date(Date.now() + nextDelay);
    await emailNotificationRepository.markRetrying(notificationId, nextRetryAt, errorReason, attemptNumber);

    // Re-enqueue with delay
    await enqueueEmailNotification(notificationId, nextDelay);
    logger.info(`ℹ️ [EmailJob] Retry scheduled in ${nextDelay / 1000}s for notificationId=${notificationId}`);
  }
}

/**
 * Enqueues a one-off email send job.
 * Falls back to a direct in-process attempt when Redis is unavailable.
 */
export async function enqueueEmailNotification(notificationId: string, delayMs = 0): Promise<void> {
  const connection = getBullConnection();

  if (!connection) {
    logger.warn('⚠️ [EmailJob] Redis not available — attempting direct send fallback');
    await processEmailNotification(notificationId);
    return;
  }

  const queue = new Queue<EmailJobPayload>(EMAIL_QUEUE_NAME, { connection });
  await queue.add(
    EMAIL_JOB_NAME,
    { notificationId },
    {
      delay: delayMs,
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );
}

/**
 * Registers and starts the email notification BullMQ worker.
 * Call once at application startup.
 */
export function startEmailNotificationWorker(): void {
  const connection = getBullConnection();

  if (!connection) {
    // getBullConnection already logged a warning
    return;
  }

  const worker = new Worker<EmailJobPayload>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobPayload>) => {
      if (job.name !== EMAIL_JOB_NAME) return;
      await processEmailNotification(job.data.notificationId);
    },
    { connection },
  );

  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error(`❌ [EmailJob] Worker job failed (id=${job?.id ?? 'unknown'}):`, err);
  });

  logger.info(`⏰ [EmailJob] Email notification worker started on queue "${EMAIL_QUEUE_NAME}"`);
}
