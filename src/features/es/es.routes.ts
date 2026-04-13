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
import { esController } from '@/composition-root.js';
import authenticateApiKey from '@/middlewares/authenticate-api-key.js';
import authenticateJWT from '@/middlewares/authenticate-jwt';

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
  esController.receiveAdvanceNotice.bind(esController),
);

/**
 * @route GET /es/item-receipt?id=<id>
 * @description Get sent item receipt data by id.
 * @headers Authorization: <bearer-token>
 * @returns { success: boolean, message: string, data: ItemReceipt }
 */
router.get(
  '/item-receipt',
  authenticateJWT,
  esController.getItemReceipt.bind(esController),
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
