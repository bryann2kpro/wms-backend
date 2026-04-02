import { Request, Response } from 'express';
import { EsAdvanceNoticeRepositoryClass } from './es-advance-notice.repository.js';
import { EmailNotificationRepositoryClass } from '@/features/notifications/email-notification.repository.js';
import { enqueueEmailNotification } from '@/features/notifications/email-notification.job.js';
import { Error } from '@/error/index.js';
import { logger } from '@/util/logger.js';
import { env } from '@/env.js';
import z from 'zod';

const lotsSchema = z.object({
  serialNumbers: z.string(),
  quantity: z.number().positive(),
  expiryDate: z.string(),
});

const lineSchema = z.object({
  lineuniquekey: z.number(),
  itemid: z.string(),
  quantity: z.number().positive(),
  units: z.string(),                       // Required per Field_Mapping_List_v3.0
  custrecord_r2o_order_code: z.string(),   // Required per Field_Mapping_List_v3.0
  displayname: z.string().optional(),      // Optional per Field_Mapping_List_v3.0
  lots: z.array(lotsSchema).optional(),
});

const advanceNoticeSchema = z.object({
  timeStamp: z.string(),
  tranid: z.string(),
  entity: z.string(),
  duedate: z.string(),
  trandate: z.string().optional(),  // Not required per Field_Mapping_List_v3.0
  currency: z.string().optional(),  // Present in sample JSON but not in field mapping
  lines: z.array(lineSchema).min(1),
});

export class EsAdvanceNoticeControllerClass {
  constructor(
    private esAdvanceNoticeRepository: EsAdvanceNoticeRepositoryClass,
    private emailNotificationRepository: EmailNotificationRepositoryClass,
  ) {}

  /**
   * Receive Advance Notice
   * POST /api/v1/es/advance-notice
   *
   * @description Accepts an advance notice JSON payload from NetSuite (Empire Sushi integration).
   * Validates the payload structure, checks for duplicate tranid, stores it, and returns 200.
   * Requires a valid API key via the `x-api-key` header (set by authenticateApiKey middleware).
   */
  async receiveAdvanceNotice(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [EsAdvanceNoticeController.receiveAdvanceNotice] Advance notice request received');

      // Step 1: Schema validation
      const result = advanceNoticeSchema.safeParse(req.body);

      if (!result.success) {
        const missingFields = result.error.issues.map((i) => i.path.join('.')).join(', ');
        logger.warn(`⚠️ [EsAdvanceNoticeController.receiveAdvanceNotice] Schema validation failed — invalid fields: ${missingFields}`);
        return res.status(400).json({
          success: false,
          message: `Validation failed. Invalid or missing fields: ${missingFields}.`,
        });
      }

      const payload = result.data;
      logger.info(`ℹ️ [EsAdvanceNoticeController.receiveAdvanceNotice] Schema valid — tranid: ${payload.tranid}`);

      // Step 2: Duplicate tranid check
      logger.info(`ℹ️ [EsAdvanceNoticeController.receiveAdvanceNotice] Checking for duplicate tranid: ${payload.tranid}`);
      const existing = await this.esAdvanceNoticeRepository.findByTranid(payload.tranid);

      if (existing) {
        logger.warn(`⚠️ [EsAdvanceNoticeController.receiveAdvanceNotice] Duplicate tranid detected: ${payload.tranid}`);
        return res.status(400).json({
          success: false,
          message: `Duplicate tranid: '${payload.tranid}' has already been received.`,
        });
      }

      // Step 3: Save
      logger.info(`ℹ️ [EsAdvanceNoticeController.receiveAdvanceNotice] No duplicate found — saving advance notice for tranid: ${payload.tranid}`);
      const record = await this.esAdvanceNoticeRepository.saveAdvanceNotice({
        tranid: payload.tranid,
        apiKeyId: req.apiKey!.id,
        payload,
      });

      logger.info(`✅ [EsAdvanceNoticeController.receiveAdvanceNotice] Advance notice saved — id: ${record.id}, tranid: ${payload.tranid}`);

      // Step 4: Enqueue admin email notification (non-fatal — never blocks the 200)
      if (env.ADMIN_EMAIL) {
        try {
          const notification = await this.emailNotificationRepository.createNotification({
            triggerType: 'ADVANCE_NOTICE_RECEIVED',
            referenceId: record.id,
            referenceLabel: payload.tranid,
            toEmail: env.ADMIN_EMAIL,
          });
          await enqueueEmailNotification(notification.id);
          logger.info(`ℹ️ [EsAdvanceNoticeController.receiveAdvanceNotice] Admin notification enqueued — notificationId: ${notification.id}`);
        } catch (notifError) {
          logger.error('❌ [EsAdvanceNoticeController.receiveAdvanceNotice] Failed to enqueue admin notification:', notifError);
        }
      } else {
        logger.warn('⚠️ [EsAdvanceNoticeController.receiveAdvanceNotice] ADMIN_EMAIL not set — skipping notification');
      }

      return res.status(200).json({
        success: true,
        message: 'Advance notice received successfully.',
      });
    } catch (error) {
      logger.error('❌ [EsAdvanceNoticeController.receiveAdvanceNotice] Unexpected error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
      });
    }
  }
}
