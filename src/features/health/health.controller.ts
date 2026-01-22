/**
 * Health Controller
 * 
 * @description Handles health check HTTP requests.
 * Used for monitoring and load balancer health probes.
 */

import { Request, Response } from 'express';
import { db } from '@/db/index';
import { test } from '@/db/db.model';
import { Error } from '@/error/index.js';
import { logger } from '@/util/logger.js';

class HealthControllerClass {
  /**
   * Basic Health Check
   * GET /health
   * 
   * @description Returns OK if the server is running.
   * Used by load balancers and monitoring tools.
   */
  healthCheck(req: Request, res: Response): void {
    logger.debug('🔍 [HealthController.healthCheck] Health check requested');
    
    res.status(200).json({
      success: true,
      message: 'OK',
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Database Health Check
   * GET /health/db
   * 
   * @description Verifies database connectivity by running a simple query.
   */
  async dbHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [HealthController.dbHealthCheck] Checking database connectivity...');
      
      const startTime = Date.now();
      const result = await db.select().from(test);
      const responseTime = Date.now() - startTime;

      logger.info('✅ [HealthController.dbHealthCheck] Database healthy, response time:', responseTime, 'ms');

      res.status(200).json({
        success: true,
        message: 'Database connection healthy',
        data: {
          status: 'healthy',
          responseTimeMs: responseTime,
          records: result.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('❌ [HealthController.dbHealthCheck] Database connection error:', error);
      res.status(500).json({
        success: false,
        message: Error.DATABASE_CONNECTION_ERROR,
        data: {
          status: 'unhealthy',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
}

// Export the class for DI wiring in composition root
export { HealthControllerClass };