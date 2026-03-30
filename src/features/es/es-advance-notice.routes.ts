/**
 * ES (Empire Sushi) Routes
 *
 * @description REST endpoints for Empire Sushi third-party integration.
 * All routes are protected by API key authentication via the `x-api-key` header.
 *
 * Endpoints:
 * - POST /es/advance-notice  - Receive an advance notice / pre-shipment payload
 */

import { Router, Request, Response, NextFunction } from 'express';
import { esAdvanceNoticeController } from '@/composition-root.js';
import authenticateApiKey from '@/middlewares/authenticate-api-key.js';

const router = Router();

/**
 * @route POST /es/advance-notice
 * @description Receive an advance notice from NetSuite (Empire Sushi integration).
 *   Validates the payload, checks for duplicate tranid, stores it, and returns 200.
 * @headers x-api-key: <api-key>
 * @body AdvanceNoticePayload
 * @returns { success: boolean, message: string }
 */
router.post(
  '/advance-notice',
  authenticateApiKey,
  esAdvanceNoticeController.receiveAdvanceNotice.bind(esAdvanceNoticeController),
);

// Malformed JSON handler — Express body parser throws SyntaxError with type 'entity.parse.failed'
// This must be a 4-arg middleware and placed after the route definitions
router.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Malformed JSON. Unable to parse request body.',
    });
  }
  next(err);
});

export default router;
