/**
 * ES (Empire Sushi) Routes
 *
 * @description REST endpoints for Empire Sushi third-party integration.
 * All routes are protected by API key authentication via the `x-api-key` header.
 *
 * Endpoints:
 * - POST /es/advance-notice  - Receive an advance notice / pre-shipment payload
 */

import { Router } from 'express';
import { esAdvanceNoticeController } from '@/composition-root.js';
import authenticateApiKey from '@/middlewares/authenticate-api-key.js';

const router = Router();

/**
 * @route POST /es/advance-notice
 * @description Receive an advance notice from Empire Sushi.
 *   Stores the raw JSON body as-is and returns a 201 acknowledgement.
 * @headers x-api-key: <api-key>
 * @body any JSON object
 * @returns { id: string, receivedAt: string }
 */
router.post(
  '/advance-notice',
  authenticateApiKey,
  esAdvanceNoticeController.receiveAdvanceNotice.bind(esAdvanceNoticeController),
);

export default router;
