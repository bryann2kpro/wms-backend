import { Queue, Worker, type Job } from 'bullmq';
import { getBullConnection } from '@/jobs/bullmq-connection';
import { logger } from '@/util/logger';
import {
  esRepository,
  whatsAppClient,
  whatsAppNotificationRepository,
  whatsAppSettingsRepository,
} from '@/composition-root';
import { formatWhatsAppMessage } from './whatsapp.service';

const WHATSAPP_QUEUE_NAME = 'whatsapp-notifications';
const WHATSAPP_JOB_NAME = 'send-whatsapp-notification';
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [0, 5 * 60 * 1000, 30 * 60 * 1000];

type WhatsAppJobPayload = { notificationId: string };

async function processWhatsAppNotification(notificationId: string): Promise<void> {
  const notification = await whatsAppNotificationRepository.findById(notificationId);

  if (!notification) {
    logger.warn(`⚠️ [WhatsAppJob] Notification not found: ${notificationId}`);
    return;
  }

  if (notification.status === 'SENT') {
    logger.info(`ℹ️ [WhatsAppJob] Notification ${notificationId} already sent, skipping`);
    return;
  }

  const attemptNumber = notification.attemptCount + 1;

  try {
    let referenceData: Record<string, unknown> = {};
    if (notification.triggerType === 'ADVANCE_NOTICE_RECEIVED') {
      const advanceNotice = await esRepository.findById(notification.referenceId);
      if (!advanceNotice) {
        await whatsAppNotificationRepository.markFailed(
          notificationId,
          'Linked advance notice record not found',
          attemptNumber,
        );
        return;
      }
      referenceData = {
        tranid: advanceNotice.tranid,
        receivedAt: advanceNotice.receivedAt,
        payload: advanceNotice.payload,
      };
    }

    const text = formatWhatsAppMessage(notification.triggerType, referenceData);
    await whatsAppClient.sendMessage(notification.toPhone, text);

    await whatsAppNotificationRepository.markSent(notificationId);
    logger.info(`✅ [WhatsAppJob] Notification sent — id=${notificationId}, to=${notification.toPhone}`);
  } catch (error) {
    const errorReason = error instanceof Error ? error.message : String(error);
    logger.error(
      `❌ [WhatsAppJob] Send attempt ${attemptNumber} failed for notificationId=${notificationId}:`,
      error,
    );

    if (attemptNumber >= MAX_ATTEMPTS) {
      await whatsAppNotificationRepository.markFailed(notificationId, errorReason, attemptNumber);
      logger.error(`❌ [WhatsAppJob] Max attempts reached — notificationId=${notificationId} marked FAILED`);
      return;
    }

    const nextDelay = RETRY_DELAYS_MS[attemptNumber] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
    const nextRetryAt = new Date(Date.now() + nextDelay);
    await whatsAppNotificationRepository.markRetrying(notificationId, nextRetryAt, errorReason, attemptNumber);
    await enqueueWhatsAppNotification(notificationId, nextDelay);
    logger.info(`ℹ️ [WhatsAppJob] Retry scheduled in ${nextDelay / 1000}s for notificationId=${notificationId}`);
  }
}

export async function enqueueWhatsAppNotification(notificationId: string, delayMs = 0): Promise<void> {
  const connection = getBullConnection();

  if (!connection) {
    logger.warn('⚠️ [WhatsAppJob] Redis not available — attempting direct send fallback');
    await processWhatsAppNotification(notificationId);
    return;
  }

  const queue = new Queue<WhatsAppJobPayload>(WHATSAPP_QUEUE_NAME, { connection });
  await queue.add(
    WHATSAPP_JOB_NAME,
    { notificationId },
    {
      delay: delayMs,
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );
}

export async function enqueueWhatsAppNotificationsForTrigger(input: {
  triggerType: string;
  referenceId: string;
  referenceLabel?: string | null;
  defaultToPhone?: string | null;
}): Promise<void> {
  const settings = await whatsAppSettingsRepository.getByKey(input.triggerType);
  const phones = settings?.toPhones?.length ? settings.toPhones : input.defaultToPhone ? [input.defaultToPhone] : [];

  for (const phone of phones) {
    const normalizedPhone = phone.trim();
    if (!normalizedPhone) continue;

    const existing = await whatsAppNotificationRepository.findActiveForReference(
      input.referenceId,
      input.triggerType,
      normalizedPhone,
    );

    if (existing) continue;

    const notification = await whatsAppNotificationRepository.createNotification({
      triggerType: input.triggerType,
      referenceId: input.referenceId,
      referenceLabel: input.referenceLabel ?? null,
      toPhone: normalizedPhone,
    });
    await enqueueWhatsAppNotification(notification.id);
  }
}

export function startWhatsAppNotificationWorker(): void {
  const connection = getBullConnection();

  if (!connection) {
    return;
  }

  const worker = new Worker<WhatsAppJobPayload>(
    WHATSAPP_QUEUE_NAME,
    async (job: Job<WhatsAppJobPayload>) => {
      if (job.name !== WHATSAPP_JOB_NAME) return;
      await processWhatsAppNotification(job.data.notificationId);
    },
    { connection },
  );

  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error(`❌ [WhatsAppJob] Worker job failed (id=${job?.id ?? 'unknown'}):`, err);
  });

  logger.info(`⏰ [WhatsAppJob] Worker started on queue "${WHATSAPP_QUEUE_NAME}"`);
}

