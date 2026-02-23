/**
 * Upload Controller
 *
 * @description Handles file upload HTTP requests.
 * Uses UploadServices for multer-based uploads (images to local disk).
 */

import { Request, Response } from 'express';
import { logger } from '@/util/logger.js';
import { Error } from '@/error/index.js';
import { UploadServices } from './upload.services.js';

// ============================================
// CONTROLLER CLASS
// ============================================

class UploadControllerClass {
  constructor(private uploadService: UploadServices) {}

  // ============================================
  // UPLOAD ENDPOINTS
  // ============================================

  /**
   * Upload image file
   * POST /upload
   *
   * @description Accepts a single image file (field: image). Allowed: JPEG, PNG, GIF. Max 5MB.
   */
  async handleUpload(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [UploadController.handleUpload] Processing upload request...');

      const data = await this.uploadService.uploadFile(req, res);

      logger.info('✅ [UploadController.handleUpload] File uploaded successfully:', data.filename);

      return res.status(200).json({
        success: true,
        message: 'File uploaded successfully',
        data,
      });
    } catch (err: any) {
      logger.error('❌ [UploadController.handleUpload] Error:', err?.message);

      const message = err?.message ?? Error.INTERNAL_SERVER_ERROR;
      const status =
        message === 'File size is too large. Max size is 5MB.' ||
        message === 'No file uploaded' ||
        message === 'Invalid file type. Only JPEG, PNG and GIF are allowed.'
          ? 400
          : 500;

      return res.status(status).json({
        success: false,
        message,
        data: null,
      });
    }
  }

  /**
   * Delete a file by filename
   * Used for cleanup (e.g. when reverting a report image).
   */
  async deleteFile(filename: string): Promise<boolean> {
    return this.uploadService.deleteFile(filename);
  }
}

export { UploadControllerClass };
