import { Request, Response } from 'express';
import { EsAdvanceNoticeRepositoryClass } from './es-advance-notice.repository.js';
import { Error } from '@/error/index.js';
import { logger } from '@/util/logger.js';
import z, { prettifyError } from 'zod';

export class EsAdvanceNoticeControllerClass {
  constructor(private esAdvanceNoticeRepository: EsAdvanceNoticeRepositoryClass) {}

  /**
   * Receive Advance Notice
   * POST /api/v1/es/advance-notice
   *
   * @description Accepts any JSON payload from Empire Sushi,
   * stores it as-is in the DB, and returns a 201 acknowledgement.
   * Requires a valid API key via the `x-api-key` header (set by authenticateApiKey middleware).
   */
  async receiveAdvanceNotice(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [EsAdvanceNoticeController.receiveAdvanceNotice] Receiving advance notice...');

      const { success, data: payload, error } = z.object({}).safeParse(req.body);

      if (!success) {
        logger.warn("⚠️ [EsAdvanceNoticeController.receiveAdvanceNotice] Validation failed:", prettifyError(error));
        return res.status(400).json({
          success: false,
          message: 'Validation Failed, please check the request body!',
        });
      }

      const record = await this.esAdvanceNoticeRepository.saveAdvanceNotice({
        apiKeyId: req.apiKey!.id,
        payload,
      });

      logger.info('✅ [EsAdvanceNoticeController.receiveAdvanceNotice] Advance notice saved:', record.id);

      return res.status(201).json({
        success: true,
        message: 'Advance notice received',
        data: payload,
      });
    } catch (error) {
      logger.error('❌ [EsAdvanceNoticeController.receiveAdvanceNotice] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }
}
