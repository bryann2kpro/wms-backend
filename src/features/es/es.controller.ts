import { Request, Response } from 'express';
import { EsRepositoryClass } from './es.repository.js';
import { EmailNotificationRepositoryClass } from '@/features/notifications/email-notification.repository.js';
import { enqueueEmailNotification } from '@/features/notifications/email-notification.job.js';
import { Error as AppError } from '@/error/index.js';
import { logger } from '@/util/logger.js';
import { env } from '@/env.js';
import z from 'zod';
import { enqueueWhatsAppNotificationsForTrigger } from '@/features/whatsapp/whatsapp.job.js';

type AdvanceNoticeLogStatus = 'success' | 'validation_error' | 'duplicate' | 'error';

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
  islotitem: z.string().optional()
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

export class EsControllerClass {
  constructor(
    private esRepository: EsRepositoryClass,
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
    const apiKeyId = req.apiKey?.id;

    const saveLog = async (status: AdvanceNoticeLogStatus, opts?: { errorMessage?: string; advanceNoticeId?: string }) => {
      try {
        await this.esRepository.saveAdvanceNoticeLog({
          apiKeyId: apiKeyId ?? null,
          rawPayload: req.body ?? {},
          status,
          errorMessage: opts?.errorMessage ?? null,
          advanceNoticeId: opts?.advanceNoticeId ?? null,
        });
      } catch (logErr) {
        logger.error('❌ [EsController.receiveAdvanceNotice] Failed to write request log:', logErr);
      }
    };

    try {
      logger.info('ℹ️ [EsController.receiveAdvanceNotice] Advance notice request received');

      // Step 1: Schema validation
      const result = advanceNoticeSchema.safeParse(req.body);

      if (!result.success) {
        const missingFields = result.error.issues.map((i) => i.path.join('.')).join(', ');
        logger.warn(`⚠️ [EsController.receiveAdvanceNotice] Schema validation failed — invalid fields: ${missingFields}`);
        await saveLog('validation_error', { errorMessage: `Validation failed. Invalid or missing fields: ${missingFields}.` });
        return res.status(400).json({
          success: false,
          message: `Validation failed. Invalid or missing fields: ${missingFields}.`,
        });
      }

      const payload = result.data;
      logger.info(`ℹ️ [EsController.receiveAdvanceNotice] Schema valid — tranid: ${payload.tranid}`);

      // Step 2: Duplicate tranid check
      logger.info(`ℹ️ [EsController.receiveAdvanceNotice] Checking for duplicate tranid: ${payload.tranid}`);
      const existing = await this.esRepository.findByTranid(payload.tranid);

      if (existing) {
        logger.warn(`⚠️ [EsController.receiveAdvanceNotice] Duplicate tranid detected: ${payload.tranid}`);
        await saveLog('duplicate', { errorMessage: `Duplicate tranid: '${payload.tranid}' has already been received.` });
        return res.status(400).json({
          success: false,
          message: `Duplicate tranid: '${payload.tranid}' has already been received.`,
        });
      }

      // Step 3: Save
      logger.info(`ℹ️ [EsController.receiveAdvanceNotice] No duplicate found — saving advance notice for tranid: ${payload.tranid}`);
      const record = await this.esRepository.saveAdvanceNotice({
        tranid: payload.tranid,
        apiKeyId: req.apiKey!.id,
        payload,
      });

      logger.info(`✅ [EsController.receiveAdvanceNotice] Advance notice saved — id: ${record.id}, tranid: ${payload.tranid}`);
      await saveLog('success', { advanceNoticeId: record.id });

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
          logger.info(`ℹ️ [EsController.receiveAdvanceNotice] Admin notification enqueued — notificationId: ${notification.id}`);
        } catch (notifError) {
          logger.error('❌ [EsController.receiveAdvanceNotice] Failed to enqueue admin notification:', notifError);
        }
      } else {
        logger.warn('⚠️ [EsController.receiveAdvanceNotice] ADMIN_EMAIL not set — skipping notification');
      }

      // Step 5: Enqueue WhatsApp notifications (non-fatal, fully async)
      if (env.WHATSAPP_ENABLED) {
        void enqueueWhatsAppNotificationsForTrigger({
          triggerType: 'ADVANCE_NOTICE_RECEIVED',
          referenceId: record.id,
          referenceLabel: payload.tranid,
        })
          .then(() => {
            logger.info(`ℹ️ [EsController.receiveAdvanceNotice] WhatsApp notifications enqueued for tranid: ${payload.tranid}`);
          })
          .catch((waError) => {
            logger.error('❌ [EsController.receiveAdvanceNotice] Failed to enqueue WhatsApp notifications:', waError);
          });
      }

      return res.status(200).json({
        success: true,
        message: 'Advance notice received successfully.',
      });
    } catch (error) {
      logger.error('❌ [EsController.receiveAdvanceNotice] Unexpected error:', error);
      const errorMessage = error instanceof globalThis.Error ? error.message : String(error);
      await saveLog('error', { errorMessage });
      return res.status(500).json({
        success: false,
        message: AppError.INTERNAL_SERVER_ERROR,
      });
    }
  }

  /**
   * Get item receipt by id
   * GET /api/v1/es/item-receipt?id=<id>
   *
   * @description Get sent item receipt data by id.
   * @headers Authorization: <bearer-token>
   * @returns { success: boolean, message: string, data: ItemReceipt }
   */
  async getItemReceipt(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [EsController.getItemReceipt] Item receipt request received');

      // Note: Id here refers to PO number
      const { success, data: poNumber, error } = z.string().min(1).safeParse(req.query.id);

      if (!success) {
        logger.warn(`⚠️ [EsController.getItemReceipt] Invalid PO Number: ${error.message}`);
        return res.status(400).json({
          success: false,
          message: `Invalid PO Number: ${error.message}`,
        });
      }

      const itemReceipt = await this.esRepository.getItemReceipt(poNumber);

      return res.status(200).json({
        success: true,
        message: 'Item receipt fetched successfully.',
        data: itemReceipt,
      });

    } catch (error) {
      logger.error('❌ [EsController.getItemReceipt] Unexpected error:', error);
      return res.status(500).json({
        success: false,
        message: AppError.INTERNAL_SERVER_ERROR,
      });
    }
  }

}
