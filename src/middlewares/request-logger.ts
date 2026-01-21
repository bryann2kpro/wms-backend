import { Request, Response, NextFunction } from 'express';
import { logger } from '@/util/logger';

/**
 * Middleware to log HTTP request details including:
 * - URL
 * - Request method
 * - IP address
 * - User agent
 * - Response time
 */
export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  // Capture response finish event to log response time
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    
    // Get client IP (considering proxies/load balancers)
    const clientIp = 
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.headers['x-real-ip'] as string) ||
      req.socket.remoteAddress ||
      'unknown';

    // Get user agent
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Log request details
    logger.info('HTTP Request', {
      method: req.method,
      url: req.originalUrl || req.url,
      ip: clientIp,
      userAgent: userAgent,
      responseTime: `${responseTime}ms`,
      statusCode: res.statusCode,
    });
  });

  next();
}



