/**
 * Health Routes
 * 
 * @description Health check endpoints for monitoring.
 * 
 * Endpoints:
 * - GET /health     - Basic server health check
 * - GET /health/db  - Database connectivity check
 */

import { Router } from 'express';
import { healthController } from '@/composition-root.js';

const router = Router();

/**
 * @route GET /health
 * @description Basic health check - returns OK if server is running
 * @returns { status: 'healthy', timestamp }
 */
router.get('', healthController.healthCheck.bind(healthController));

/**
 * @route GET /health/db
 * @description Database health check - verifies DB connectivity
 * @returns { status, responseTimeMs, records, timestamp }
 */
router.get('/db', healthController.dbHealthCheck.bind(healthController));

export default router;