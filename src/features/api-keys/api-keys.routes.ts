/**
 * API Keys Routes
 *
 * @description Management endpoints for third-party API keys.
 * All routes require a valid user JWT (admin-level access).
 *
 * Endpoints:
 * - POST   /api-keys         - Generate a new API key (raw key returned once)
 * - GET    /api-keys         - List all API keys (metadata only)
 * - DELETE /api-keys/:id     - Revoke an API key
 */

import { Router } from 'express';
import { apiKeysController } from '@/composition-root.js';
import authenticateJWT from '@/middlewares/authenticate-jwt.js';

const router = Router();

/**
 * @route POST /api-keys
 * @description Create a new API key. Returns the raw key once — save it immediately.
 * @body { name: string, organizationId?: string, expiresAt?: string }
 * @headers Authorization: Bearer <token>
 */
router.post('/', authenticateJWT, apiKeysController.createApiKey.bind(apiKeysController));

/**
 * @route GET /api-keys
 * @description List API keys (metadata only, raw key never returned).
 * @query organizationId? - Filter by organization
 * @headers Authorization: Bearer <token>
 */
router.get('/', authenticateJWT, apiKeysController.listApiKeys.bind(apiKeysController));

/**
 * @route DELETE /api-keys/:id
 * @description Revoke an API key (soft-delete — sets isActive = false).
 * @headers Authorization: Bearer <token>
 */
router.delete('/:id', authenticateJWT, apiKeysController.revokeApiKey.bind(apiKeysController));

export default router;
