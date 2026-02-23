/**
 * Upload Routes
 *
 * @description File upload routes.
 *
 * Endpoints:
 * - POST /upload - Upload a single image (field: image, max 5MB, JPEG/PNG/GIF)
 */

import { Router } from 'express';
import { uploadController } from '@/composition-root.js';

const router = Router();

/**
 * @route POST /upload
 * @description Upload a single image file (multipart/form-data, field: image)
 * @returns { url, filename, originalName, size, mimetype }
 */
router.post('/', uploadController.handleUpload.bind(uploadController));

export default router;
